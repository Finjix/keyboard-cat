import { describe, it, expect } from "vitest";
import { Engine, IDLE, HOUR, BUBBLE, PANEL_EVERY } from "../src/main/engine";
import { keys } from "../src/shared/keyboard";
import { keySurface } from "../src/shared/keyboard-art";
import { restLines } from "../src/main/rest-lines";
import { HeldKeys, STALE_KEY_MS } from "../src/shared/held-keys";
const base = new Date(2026, 10, 9, 12).getTime();
describe("work engine", () => {
  it("keeps the rest look until 我知道了, even past a fun turn", () => {
    const e = new Engine(0, base);
    let t = 0;
    const work = (to: number) => {
      for (; t <= to; t += 60_000) e.input({ type: "mousemove" }, t, base + t);
    };
    work(HOUR);
    expect(e.panel?.mode).toBe("rest");
    // Past the ordinary ten minutes and the 80-minute fun turn.
    work(HOUR + PANEL_EVERY);
    expect(e.panel?.mode).toBe("rest");
    e.dismiss();
    expect(e.panel).toBeNull();
    work(HOUR + PANEL_EVERY * 2);
    expect(e.panel?.mode).toBe("fun");
  });
  it("maps all 104 keys onto the generated keyboard image", () => {
    for (const key of keys) {
      const r = keySurface(key);
      expect(r).toBeDefined();
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(930);
      expect(r.y + r.h).toBeLessThanOrEqual(310);
    }
  });
  it("starts inactive, deduplicates held keys and buttons", () => {
    const e = new Engine(0, base);
    e.tick(10000, base + 10000);
    expect(e.daily.workMs).toBe(0);
    for (let i = 0; i < 10; i++)
      e.input({ type: "keydown", keycode: 30 }, 10000 + i, base + 10000 + i);
    expect(e.daily.keys).toBe(1);
    e.input({ type: "keyup", keycode: 30 }, 10020, base + 10020);
    e.input({ type: "keydown", keycode: 30 }, 10030, base + 10030);
    expect(e.daily.keys).toBe(2);
    e.input({ type: "mousedown", button: 1 }, 10040, base + 10040);
    e.input({ type: "mousedown", button: 1 }, 10050, base + 10050);
    expect(e.daily.clicks).toBe(1);
  });
  it("clips work at five minutes and restarts continuity", () => {
    const e = new Engine(0, base);
    e.input({ type: "mousemove" }, 0, base);
    e.tick(IDLE - 1, base + IDLE - 1);
    expect(e.continuousMs).toBe(IDLE - 1);
    e.tick(IDLE, base + IDLE);
    expect(e.continuousMs).toBe(0);
    e.tick(IDLE * 3, base + IDLE * 3);
    expect(e.daily.workMs).toBe(IDLE);
  });
  it("reminds every continuous hour and expires after thirty minutes", () => {
    const e = new Engine(0, base);
    for (let t = 0; t <= HOUR * 2; t += 60000)
      e.input({ type: "mousemove" }, t, base + t);
    expect(e.reminderUntil).toBe(base + HOUR * 2 + BUBBLE);
    expect(restLines).toContain(e.reminderText);
    e.tick(HOUR * 2 + BUBBLE, base + HOUR * 2 + BUBBLE);
    expect(e.reminderUntil).toBe(0);
  });
  it("keeps reminder text stable until triggered again", () => {
    const e = new Engine(0, base);
    e.remind(base);
    const text = e.reminderText;
    e.tick(1000, base + 1000);
    expect(e.reminderText).toBe(text);
    e.remind(base + 2000);
    expect(restLines).toContain(e.reminderText);
    expect(e.reminderText).not.toBe(text);
    expect(e.reminderUntil).toBe(base + 2000 + BUBBLE);
    expect(e.daily.workMs).toBe(0);
  });
  it("closing reminder does not reset continuity", () => {
    const e = new Engine(0, base);
    for (let t = 0; t <= HOUR; t += 60000)
      e.input({ type: "mousemove" }, t, base + t);
    e.reminderUntil = 0;
    e.tick(HOUR + 1000, base + HOUR + 1000);
    expect(e.reminderUntil).toBe(0);
    expect(e.continuousMs).toBe(HOUR + 1000);
  });
  it("stop cuts off tail immediately and resume waits for input", () => {
    const e = new Engine(0, base);
    e.input({ type: "mousemove" }, 0, base);
    e.stop(1000, base + 1000);
    e.tick(60000, base + 60000);
    expect(e.daily.workMs).toBe(1000);
    expect(e.continuousMs).toBe(0);
  });
  it("splits at midnight without resetting continuity", () => {
    const start = new Date(2026, 10, 9, 23, 59, 50).getTime();
    const e = new Engine(0, start);
    e.input({ type: "mousemove" }, 0, start);
    e.tick(20000, start + 20000);
    expect(e.daily.date).toBe("2026-11-10");
    expect(e.daily.workMs).toBe(10000);
    expect(e.continuousMs).toBe(20000);
  });
  it("restores only current-day aggregates", () => {
    const e = new Engine(0, base, {
      date: "2026-11-09",
      keys: 9,
      clicks: 8,
      workMs: 1000,
    });
    expect(e.daily.keys).toBe(9);
    expect(e.continuousMs).toBe(0);
    e.tick(10000, base + 10000);
    expect(e.daily.workMs).toBe(1000);
  });
  it("ignores corrupted saved counts", () => {
    const e = new Engine(0, base, {
      date: "2026-11-09",
      keys: "x" as unknown as number,
      clicks: -3,
      workMs: NaN,
    });
    expect(e.daily).toEqual({
      date: "2026-11-09",
      keys: 0,
      clicks: 0,
      workMs: 0,
    });
  });
  it("counts a key again when its key-up was swallowed", () => {
    const e = new Engine(0, base);
    // Ctrl+Alt+Del: the secure desktop eats the key-up of Delete.
    e.input({ type: "keydown", keycode: 3667 }, 1000, base + 1000);
    e.input({ type: "keydown", keycode: 3667 }, 1000 + STALE_KEY_MS, base);
    expect(e.daily.keys).toBe(2);
    // Genuine auto-repeat while held still counts once.
    for (let t = 1; t <= 20; t++)
      e.input(
        { type: "keydown", keycode: 3667 },
        1000 + STALE_KEY_MS + t * 33,
        base,
      );
    expect(e.daily.keys).toBe(2);
  });
  it("uses monotonic durations across wall clock jumps", () => {
    const e = new Engine(0, base);
    e.input({ type: "mousemove" }, 0, base);
    e.tick(1000, base + 3600000);
    expect(e.daily.workMs).toBe(1000);
    expect(e.continuousMs).toBe(1000);
  });
  it("has exactly 104 distinct physical keys", () => {
    expect(keys).toHaveLength(104);
    expect(new Set(keys.map((k) => k.code)).size).toBe(104);
  });
});
describe("held keys", () => {
  it("separates fresh presses from auto-repeat and sweeps lost key-ups", () => {
    const h = new HeldKeys();
    expect(h.down(29, 0)).toBe(true);
    expect(h.down(29, 500)).toBe(false);
    expect(h.down(30, 1000)).toBe(true);
    expect(h.sweep(500 + STALE_KEY_MS - 1)).toBe(false);
    expect(h.sweep(500 + STALE_KEY_MS)).toBe(true);
    expect(h.has(29)).toBe(false);
    expect(h.has(30)).toBe(true);
    expect(h.up(30)).toBe(true);
    expect(h.size).toBe(0);
  });
});
