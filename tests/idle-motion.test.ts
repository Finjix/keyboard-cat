import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  IDLE_STEP_MS,
  idleCss,
  idleKeyframes,
} from "../src/renderer/idle-motion";

const frames = (css: string) =>
  [...css.matchAll(/([\d.]+)%\{([^}]*)\}/g)].map((m) => ({
    at: Number(m[1]),
    body: m[2],
  }));

describe("待机摆动帧率", () => {
  it("samples one frame per 100ms step and returns to rest", () => {
    const css = idleKeyframes("t", 6800, (w) => `translate:0 ${-4 * w}px`);
    const list = frames(css);
    expect(list).toHaveLength(6800 / IDLE_STEP_MS + 1);
    expect(list[0]).toEqual({ at: 0, body: "translate:0 0px" });
    expect(list.at(-1)).toEqual({ at: 100, body: "translate:0 0px" });
    expect(list[34].body).toBe("translate:0 -4px");
    // Each step is the same share of the cycle, so steps land on the grid.
    const gaps = list.slice(1).map((f, i) => f.at - list[i].at);
    for (const g of gaps) expect(g).toBeCloseTo(100 / 68, 4);
  });
  it("moves at most a fraction of a pixel per frame", () => {
    const list = frames(idleKeyframes("t", 6800, (w) => `${-4 * w}`));
    const ys = list.map((f) => Number(f.body));
    const jumps = ys.slice(1).map((y, i) => Math.abs(y - ys[i]));
    expect(Math.max(...jumps)).toBeLessThan(0.2);
  });
  it("rejects durations off the shared grid", () => {
    expect(() => idleKeyframes("t", 6850, () => "")).toThrow();
  });
  it("keeps style.css durations on the grid", () => {
    expect(idleCss).toContain("@keyframes cat-breathe");
    expect(idleCss).toContain("@keyframes paw-idle{");
    expect(idleCss).toContain("@keyframes paw-idle-right");
    const css = readFileSync("src/renderer/style.css", "utf8");
    for (const [rule, ms] of [
      [/\.cat \{[^}]*animation: cat-breathe ([\d.]+)s steps\(1, jump-end\)/, 6800],
      [/\.paw \{[^}]*animation: paw-idle ([\d.]+)s steps\(1, jump-end\)/, 5800],
      [/\.paw\.right \{[^}]*animation-duration: ([\d.]+)s/, 6600],
    ] as const) {
      const m = css.match(rule);
      expect(m, String(rule)).not.toBeNull();
      expect(Number(m![1]) * 1000).toBe(ms);
    }
    const delay = Number(css.match(/animation-delay: (-?[\d.]+)s/)![1]) * 1000;
    expect(Math.abs(Math.round(delay) % IDLE_STEP_MS)).toBe(0);
  });
});
