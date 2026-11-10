import { uIOhook } from "uiohook-napi";
import koffi from "koffi";
import { MOD_VK } from "../shared/modifiers";
const aliases: Record<number, number> = {
  60999: 71,
  61000: 72,
  61001: 73,
  61003: 75,
  61005: 77,
  61007: 79,
  61008: 80,
  61009: 81,
  61010: 82,
  61011: 83,
};
const parent = process.parentPort!;
// Windows stops auto-repeating a held modifier once another key goes down, so
// a long-held Alt (Alt+Tab, Alt+Tab, ...) looks released to the hook-side
// bookkeeping. Ask Windows for the real modifier state on each key press.
let keyState: ((vk: number) => number) | undefined;
try {
  keyState = koffi
    .load("user32.dll")
    .func("int16_t __stdcall GetAsyncKeyState(int)");
} catch {}
const mods = () => {
  if (!keyState) return undefined;
  let m = 0;
  for (const [vk, bit] of MOD_VK) if (keyState(vk) < 0) m |= bit;
  return m;
};
// Movement and wheel only mark activity (idle threshold is five minutes), so a
// few messages per second are plenty; precision touchpads emit hundreds.
const ACTIVITY_MS = 200;
const lastActivity = { mousemove: 0, wheel: 0 };
for (const type of [
  "keydown",
  "keyup",
  "mousedown",
  "mouseup",
  "mousemove",
  "wheel",
] as const) {
  uIOhook.on(type as any, (e: any) => {
    if (type === "mousemove" || type === "wheel") {
      const now = Date.now();
      if (now - lastActivity[type] < ACTIVITY_MS) return;
      lastActivity[type] = now;
    }
    parent.postMessage({
      type,
      keycode: aliases[e.keycode] ?? e.keycode,
      button: e.button,
      x: e.x,
      y: e.y,
      mods: type === "keydown" ? mods() : undefined,
    });
  });
}
try {
  uIOhook.start();
  parent.postMessage({ ready: true });
} catch (e) {
  parent.postMessage({ error: String(e) });
}
parent.on("message", () => {
  uIOhook.stop();
  process.exit(0);
});
