import { describe, expect, it } from "vitest";
import { Engine, HOUR, PANEL_EVERY, PANEL_FOR } from "../src/main/engine";
import { PANEL_EFFECT_COUNT } from "../src/shared/types";
import { funLooks, restLooks, panelLook } from "../src/renderer/panel-effects";

const base = new Date(2026, 10, 9, 12).getTime();
// Keep working (a move every minute) up to `until` ms of continuous work.
const workUntil = (e: Engine, from: number, until: number) => {
  for (let t = from; t <= until; t += 60000)
    e.input({ type: "mousemove" }, t, base + t);
};

describe("统计面板造型", () => {
  it("has 30 fun and 30 rest looks, 25 animated and 5 still", () => {
    expect(PANEL_EFFECT_COUNT).toBe(30);
    for (const looks of [funLooks, restLooks]) {
      expect(looks).toHaveLength(30);
      expect(new Set(looks.map((l) => l.name)).size).toBe(30);
      expect(looks.filter((l) => l.motion).length).toBe(25);
    }
  });
  it("dresses up every 20 working minutes for 10 minutes", () => {
    const e = new Engine(0, base);
    workUntil(e, 0, PANEL_EVERY - 60000);
    expect(e.panel).toBeNull();
    workUntil(e, PANEL_EVERY, PANEL_EVERY);
    expect(e.panel).toMatchObject({
      mode: "fun",
      until: base + PANEL_EVERY + PANEL_FOR,
    });
    workUntil(e, PANEL_EVERY + 60000, PANEL_EVERY + PANEL_FOR - 60000);
    expect(e.panel?.mode).toBe("fun");
    workUntil(e, PANEL_EVERY + PANEL_FOR, PANEL_EVERY * 2 - 60000);
    expect(e.panel).toBeNull();
    workUntil(e, PANEL_EVERY * 2, PANEL_EVERY * 2);
    expect(e.panel?.mode).toBe("fun");
  });
  it("shows a rest look at the hour, cleared by 我知道了", () => {
    const e = new Engine(0, base);
    workUntil(e, 0, HOUR);
    expect(e.panel).toMatchObject({
      mode: "rest",
      until: base + HOUR + PANEL_FOR,
    });
    e.dismiss();
    expect(e.reminderUntil).toBe(0);
    expect(e.panel).toBeNull();
    workUntil(e, HOUR + 60000, HOUR + PANEL_EVERY);
    expect(e.panel?.mode).toBe("fun");
  });
  it("never repeats a look back to back and honours a chosen look", () => {
    const e = new Engine(0, base);
    let last = -1;
    for (let i = 0; i < 200; i++) {
      e.showPanel("fun", base);
      expect(e.panel!.index).not.toBe(last);
      expect(e.panel!.index).toBeGreaterThanOrEqual(0);
      expect(e.panel!.index).toBeLessThan(PANEL_EFFECT_COUNT);
      last = e.panel!.index;
    }
    e.showPanel("rest", base, 7);
    expect(e.panel).toMatchObject({ mode: "rest", index: 7 });
    expect(panelLook(e.panel, base + PANEL_FOR)).toBeNull();
    expect(panelLook(e.panel, base)).toBe(restLooks[7]);
  });
});
