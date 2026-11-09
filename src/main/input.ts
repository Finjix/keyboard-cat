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
let moveAt = 0;
for (const type of [
  "keydown",
  "keyup",
  "mousedown",
  "mouseup",
  "mousemove",
  "wheel",
] as const) {
  uIOhook.on(type as any, (e: any) => {
    if (type === "mousemove") {
      const now = Date.now();
      if (now - moveAt < 16) return;
      moveAt = now;
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
