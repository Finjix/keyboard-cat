import {
  app,
  BrowserWindow,
  ipcMain,
  powerMonitor,
  screen,
  utilityProcess,
  UtilityProcess,
  Tray,
  Menu,
} from "electron";
import { join } from "node:path";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  appendFileSync,
} from "node:fs";
import { performance } from "node:perf_hooks";
import { Engine } from "./engine";
import {
  petLines,
  PET_SPEECH_MS,
  STARTUP_SPEECH,
} from "./pet-lines";
import { fastTypingLines } from "./typing-burst";
import { Desktop, sceneBounds } from "./desktop";
import { defaults, Settings, Snapshot, Input } from "../shared/types";
app.setName("懵薯");
app.setAppUserModelId("cn.mengshu.desktop");
app.setPath(
  "userData",
  join(
    app.getPath("appData"),
    process.argv.includes("--smoke")
      ? "Mengshu-smoke"
      : app.isPackaged
        ? "Mengshu"
        : "Mengshu-dev",
  ),
);
let win: BrowserWindow,
  worker: UtilityProcess | null = null,
  desktop: Desktop,
  engine: Engine;
let settings = { ...defaults },
  desktopError = "",
  inputError = "",
  speech = "",
  speechUntil = 0,
  locked = false,
  quitting = false,
  ready = false;
let storePath = "",
  logPath = "";
let speechTimer: ReturnType<typeof setTimeout> | undefined;
let tray: Tray | undefined;
function refreshTrayMenu() {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      {
        id: "autostart",
        label: "开机自启",
        type: "checkbox",
        checked: settings.autoStart,
        click: () => update({ autoStart: !settings.autoStart }),
      },
      { id: "quit", label: "退出", click: () => app.quit() },
    ]),
  );
}
function createTray() {
  tray = new Tray(
    app.isPackaged
      ? join(process.resourcesPath, "icon.ico")
      : join(__dirname, "../../build/icon.ico"),
  );
  tray.setToolTip("懵薯");
  refreshTrayMenu();
}
const log = (s: string) => {
  if (logPath) appendFileSync(logPath, `${new Date().toISOString()} ${s}\n`);
};
const state = (): Snapshot => ({
  daily: engine.daily,
  continuousMs: engine.continuousMs,
  reminderUntil: engine.reminderUntil,
  reminderText: engine.reminderText,
  speech,
  speechUntil,
  settings,
  desktopError,
  inputError,
});
function publish() {
  if (engine.reminderUntil > Date.now()) clearSpeech();
  if (!win.isDestroyed()) {
    win.webContents.send("state", state());
  }
}
function save() {
  writeFileSync(
    storePath + ".tmp",
    JSON.stringify({ settings, daily: engine.daily }),
  );
  renameSync(storePath + ".tmp", storePath);
}
function load(w: BrowserWindow, query?: string) {
  const url = process.env.ELECTRON_RENDERER_URL;
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith("file:") && !(url && target.startsWith(url)))
      event.preventDefault();
  });
  if (url) void w.loadURL(url + (query ? "?" + query : ""));
  else
    void w.loadFile(
      join(__dirname, "../renderer/index.html"),
      query ? { query: { view: query } } : undefined,
    );
}
function createScene() {
  win = new BrowserWindow({
    ...sceneBounds(settings),
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  win.setIgnoreMouseEvents(true);
  win.webContents.on("did-finish-load", () => {
    if (!ready) say(STARTUP_SPEECH);
    ready = true;
    attach();
  });
  win.on("close", (e) => {
    if (!quitting && desktop.alive()) {
      e.preventDefault();
      update({ visible: false });
    }
  });
  load(win);
}
function attach() {
  if (win.isDestroyed()) {
    createScene();
    return;
  }
  try {
    win.hide();
    desktop.detach(win);
    win.setBounds(sceneBounds(settings));
    if (settings.visible) win.showInactive();
    desktop.attach(win, sceneBounds(settings));
    win.setSkipTaskbar(true);
    desktopError = "";
    log(
      "desktop attached " +
        JSON.stringify({
          native: desktop.bounds(win),
          desired: sceneBounds(settings),
          displays: screen.getAllDisplays(),
        }),
    );
  } catch (e) {
    desktopError = String(e);
    if (!win.isDestroyed()) win.hide();
    log(desktopError);
  }
  publish();
}
function update(p: Partial<Settings>) {
  const n = { ...settings };
  for (const key of ["visible", "paused", "autoStart"] as const)
    if (typeof p[key] === "boolean") n[key] = p[key]!;
  for (const key of ["area", "x", "y"] as const)
    if (typeof p[key] === "number" && Number.isFinite(p[key]))
      n[key] = Math.max(
        key === "area" ? 0.1 : 0,
        Math.min(key === "area" ? 0.85 : 1, p[key]!),
      );
  if (
    p.displayId === null ||
    screen.getAllDisplays().some((d) => d.id === p.displayId)
  )
    n.displayId = p.displayId ?? null;
  if (n.paused !== settings.paused) {
    engine.stop(performance.now(), Date.now());
    win.webContents.send("reset-input");
  }
  settings = n;
  refreshTrayMenu();
  if (app.isPackaged && !process.argv.includes("--smoke"))
    app.setLoginItemSettings({
      openAtLogin: settings.autoStart,
      name: "cn.mengshu.desktop",
      args: ["--autostart"],
    });
  const layoutChanged = ["visible", "displayId", "area", "x", "y"].some(
    (k) => k in p,
  );
  if (layoutChanged) {
    if (settings.visible) attach();
    else win.hide();
  }
  save();
  publish();
}
function clearSpeech() {
  clearTimeout(speechTimer);
  speechTimer = undefined;
  speech = "";
  speechUntil = 0;
}
function say(text: string, duration = PET_SPEECH_MS) {
  if (engine.reminderUntil > Date.now()) return;
  speech = text;
  speechUntil = Date.now() + duration;
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => {
    clearSpeech();
    publish();
  }, duration);
}
let lastFastLine = "";
function interact(action: string) {
  if (action === "dismiss") {
    const acknowledged = engine.reminderUntil > Date.now();
    engine.reminderUntil = 0;
    publish();
    if (acknowledged && settings.visible && !win.isDestroyed())
      win.webContents.send("meow");
    return;
  } else if (action === "debug-hour" && process.argv.includes("--smoke"))
    // Test-only shortcut for the hourly reminder; no longer in the tray.
    engine.remind(Date.now());
  else if (action === "pet") {
    // The sound belongs to a newly accepted bubble, not to every mouse click.
    if (speechUntil > Date.now() || engine.reminderUntil > Date.now()) return;
    say(petLines[Math.floor(Math.random() * petLines.length)]);
    if (Math.random() < 0.22 && settings.visible && !win.isDestroyed())
      win.webContents.send("meow");
  }
  publish();
}
function startInput() {
  worker?.kill();
  inputError = "";
  const current = utilityProcess.fork(join(__dirname, "input.js"));
  worker = current;
  let received = false;
  const timeout = setTimeout(() => {
    if (!received && worker === current) {
      inputError = "输入监听未就绪，请重新启动懵薯";
      publish();
    }
  }, 10000);
  current.on("message", (e: Input & { error?: string; ready?: boolean }) => {
    if (worker !== current) return;
    received = true;
    clearTimeout(timeout);
    if (e.ready) {
      log("input ready");
      publish();
      return;
    }
    if (e.error) {
      inputError = e.error;
      log(inputError);
      publish();
      return;
    }
    if (locked || win.isDestroyed()) return;
    if (!settings.paused) {
      const burst = engine.input(e, performance.now(), Date.now());
      if (burst && settings.visible) {
        const choices = fastTypingLines.filter((line) => line !== lastFastLine);
        lastFastLine = choices[Math.floor(Math.random() * choices.length)];
        say(lastFastLine, 4500);
        win.webContents.send("meow");
        publish();
      }
      win.webContents.send("input", e);
    }
    if (e.type === "mouseup" && e.button === 1 && settings.visible) {
      try {
        if (desktop.desktopPoint(e.x!, e.y!)) {
          const b = desktop.bounds(win),
            factor = win.webContents.getZoomFactor();
          const d = screen.getDisplayMatching(sceneBounds(settings));
          win.webContents.send("desktop-click", {
            x: (e.x! - b.left) / d.scaleFactor / factor,
            y: (e.y! - b.top) / d.scaleFactor / factor,
          });
        }
      } catch (err) {
        log(String(err));
      }
    }
  });
  current.on("exit", (code) => {
    clearTimeout(timeout);
    if (!quitting && worker === current) {
      inputError = `键鼠监听已退出 (${code})，请重新启动懵薯`;
      engine.stop(performance.now(), Date.now());
      publish();
      log(inputError);
    }
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(() => {
    mkdirSync(app.getPath("userData"), { recursive: true });
    storePath = join(app.getPath("userData"), "state.json");
    logPath = join(app.getPath("userData"), "diagnostics.log");
    let saved: any;
    try {
      saved = JSON.parse(readFileSync(storePath, "utf8"));
      settings = {
        ...defaults,
        autoStart:
          typeof saved.settings?.autoStart === "boolean"
            ? saved.settings.autoStart
            : true,
      };
    } catch {}
    engine = new Engine(performance.now(), Date.now(), saved?.daily);
    desktop = new Desktop();
    createScene();
    createTray();
    startInput();
    ipcMain.handle("snapshot", () => state());
    ipcMain.handle("update", (_e, p) => update(p));
    ipcMain.on("interact", (_e, a) => interact(a));
    ipcMain.on("quit", () => app.quit());
    for (const event of ["lock-screen", "suspend"] as const)
      (powerMonitor as NodeJS.EventEmitter).on(event, () => {
        locked = true;
        engine.stop(performance.now(), Date.now());
        win.webContents.send("reset-input");
        save();
        publish();
      });
    for (const event of ["unlock-screen", "resume"] as const)
      (powerMonitor as NodeJS.EventEmitter).on(event, () => {
        engine.stop(performance.now(), Date.now());
        locked = false;
      });
    setInterval(() => {
      engine.tick(performance.now(), Date.now());
      publish();
    }, 1000);
    setInterval(save, 5000);
    setInterval(() => {
      if (ready && settings.visible && (win.isDestroyed() || !desktop.alive()))
        attach();
    }, 3000);
    screen.on("display-metrics-changed", attach);
    screen.on("display-removed", attach);
    if (app.isPackaged && !process.argv.includes("--smoke"))
      app.setLoginItemSettings({
        openAtLogin: settings.autoStart,
        name: "cn.mengshu.desktop",
        args: ["--autostart"],
      });
    log("app ready");
  });
  app.on("second-instance", () => {
    if (ready) attach();
  });
  app.on("window-all-closed", () => {});
  app.on("before-quit", () => {
    quitting = true;
    tray?.destroy();
    clearTimeout(speechTimer);
    worker?.kill();
    if (engine) {
      engine.stop(performance.now(), Date.now());
      save();
    }
  });
}
