import koffi from "koffi";
import { BrowserWindow, screen } from "electron";
const u = koffi.load("user32.dll"),
  k = koffi.load("kernel32.dll");
const fn = (s: string) => u.func(s);
const find = fn("void * __stdcall FindWindowW(str16, str16)"),
  child = fn("void * __stdcall FindWindowExW(void *, void *, str16, str16)");
const enumProto = koffi.proto(
  "bool __stdcall EnumWindowProc(void *, intptr_t)",
);
const enumerate = fn("bool __stdcall EnumWindows(void *, intptr_t)");
const send = fn(
  "intptr_t __stdcall SendMessageTimeoutW(void *, uint32_t, uintptr_t, intptr_t, uint32_t, uint32_t, _Out_ uintptr_t *)",
);
const parent = fn("void * __stdcall SetParent(void *, void *)"),
  valid = fn("bool __stdcall IsWindow(void *)");
const getStyle = fn("intptr_t __stdcall GetWindowLongPtrW(void *, int)"),
  setStyle = fn("intptr_t __stdcall SetWindowLongPtrW(void *, int, intptr_t)");
const position = fn(
  "bool __stdcall SetWindowPos(void *, void *, int, int, int, int, uint32_t)",
);
const point = koffi.struct("MSPoint", { x: "int32_t", y: "int32_t" });
const rect = koffi.struct("MSRect", {
  left: "int32_t",
  top: "int32_t",
  right: "int32_t",
  bottom: "int32_t",
});
const getRect = fn("bool __stdcall GetWindowRect(void *, _Out_ MSRect *)");
const atPoint = fn("void * __stdcall WindowFromPoint(MSPoint)"),
  toClient = fn("bool __stdcall ScreenToClient(void *, _Inout_ MSPoint *)");
const cls = fn("int __stdcall GetClassNameW(void *, _Out_ uint16_t *, int)");
const pid = fn(
  "uint32_t __stdcall GetWindowThreadProcessId(void *, _Out_ uint32_t *)",
);
const open = k.func("void * __stdcall OpenProcess(uint32_t, bool, uint32_t)"),
  alloc = k.func(
    "void * __stdcall VirtualAllocEx(void *, void *, size_t, uint32_t, uint32_t)",
  ),
  free = k.func(
    "bool __stdcall VirtualFreeEx(void *, void *, size_t, uint32_t)",
  ),
  write = k.func(
    "bool __stdcall WriteProcessMemory(void *, void *, void *, size_t, void *)",
  ),
  close = k.func("bool __stdcall CloseHandle(void *)");
const message = fn(
  "intptr_t __stdcall SendMessageW(void *, uint32_t, uintptr_t, void *)",
);
const className = (h: any) => {
  const b = Buffer.alloc(512);
  cls(h, b, 256);
  return b.toString("utf16le").replace(/\0.*$/s, "");
};
export class Desktop {
  private host: any = null;
  detach(win: BrowserWindow) {
    const h = koffi.decode(win.getNativeWindowHandle(), "void *");
    parent(h, null);
    setStyle(h, -16, (Number(getStyle(h, -16)) & ~0x40000000) | 0x80000000);
    this.host = null;
  }
  attach(win: BrowserWindow, target: Electron.Rectangle) {
    const b = screen.dipToScreenRect(null, target),
      p = { x: b.x, y: b.y };
    const progman = find("Progman", null);
    if (!progman) throw Error("未找到 Windows 桌面，请启动资源管理器后重试");
    send(progman, 0x052c, 0xd, 1, 2, 1000, [0]);
    let worker: any = null;
    const cb = koffi.register((h: any) => {
      if (child(h, null, "SHELLDLL_DefView", null)) {
        const next = child(null, h, "WorkerW", null);
        if (next) worker = next;
      }
      return true;
    }, koffi.pointer(enumProto));
    try {
      enumerate(cb, 0);
    } finally {
      koffi.unregister(cb);
    }
    worker = worker || child(progman, null, "WorkerW", null) || progman;
    const h = koffi.decode(win.getNativeWindowHandle(), "void *");
    setStyle(h, -16, (Number(getStyle(h, -16)) & ~0x80000000) | 0x40000000);
    parent(h, worker);
    this.host = worker;
    toClient(worker, p);
    position(h, null, p.x, p.y, b.width, b.height, 0x0014 | 0x0020);
    // Some shell versions virtualize ScreenToClient despite a PMv2 caller.
    // Correct the final screen rectangle instead of relying on Electron's child-window bounds.
    const actual = { left: 0, top: 0, right: 0, bottom: 0 };
    getRect(h, actual);
    if (actual.left !== b.x || actual.top !== b.y)
      position(
        h,
        null,
        p.x + b.x - actual.left,
        p.y + b.y - actual.top,
        b.width,
        b.height,
        0x0014,
      );
  }
  bounds(win: BrowserWindow) {
    const r = { left: 0, top: 0, right: 0, bottom: 0 };
    getRect(koffi.decode(win.getNativeWindowHandle(), "void *"), r);
    return r;
  }
  alive() {
    return !!this.host && valid(this.host);
  }
  desktopPoint(x: number, y: number) {
    const h = atPoint({ x, y });
    if (!h) return false;
    const name = className(h);
    if (
      !["Progman", "WorkerW", "SysListView32", "SHELLDLL_DefView"].includes(
        name,
      )
    )
      return false;
    if (name !== "SysListView32") return true;
    // LVM_HITTEST uses a pointer in Explorer's address space. Never pass a local buffer.
    const ids = [0];
    pid(h, ids);
    const process = open(0x38, false, ids[0]);
    if (!process) return false;
    let remote: any = null;
    try {
      remote = alloc(process, null, 24, 0x3000, 4);
      if (!remote) return false;
      const p = { x, y };
      toClient(h, p);
      const b = Buffer.alloc(24);
      b.writeInt32LE(p.x);
      b.writeInt32LE(p.y, 4);
      if (!write(process, remote, b, 24, null)) return false;
      return Number(message(h, 0x1012, 0, remote)) < 0;
    } finally {
      if (remote) free(process, remote, 0, 0x8000);
      close(process);
    }
  }
}
export function sceneBounds(settings: {
  displayId: number | null;
  area: number;
  x: number;
  y: number;
}) {
  const d =
    screen.getAllDisplays().find((x) => x.id === settings.displayId) ||
    screen.getPrimaryDisplay();
  const b = d.workArea;
  const scale = Math.min(
    Math.sqrt((b.width * b.height * settings.area) / (1440 * 960)),
    b.width / 1440,
    b.height / 960,
  );
  const width = Math.round(1440 * scale),
    height = Math.round(960 * scale);
  return {
    x: Math.round(b.x + b.width * settings.x - width / 2),
    y: Math.round(b.y + (b.height - height) * settings.y),
    width,
    height,
  };
}
/** The window: the whole work area of the scene's display. */
export function stageBounds(settings: { displayId: number | null }) {
  const d =
    screen.getAllDisplays().find((x) => x.id === settings.displayId) ||
    screen.getPrimaryDisplay();
  return { ...d.workArea };
}
