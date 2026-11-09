import { uIOhook } from "uiohook-napi";
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
