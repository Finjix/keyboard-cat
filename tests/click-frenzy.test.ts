import { describe, expect, it } from "vitest";
import {
  ClickFrenzy,
  FRENZY_CLICKS,
  FRENZY_MS,
  FRENZY_WINDOW_MS,
} from "../src/shared/click-frenzy";

describe("click frenzy", () => {
  it("bounces on ordinary clicks and goes wild on a fast run", () => {
    const f = new ClickFrenzy();
    for (let i = 0; i < FRENZY_CLICKS - 1; i++)
      expect(f.click(i * 200)).toBe("bounce");
    expect(f.click((FRENZY_CLICKS - 1) * 200)).toBe("frenzy");
    expect(f.active(1000)).toBe(true);
  });
  it("ignores slow clicks spread past the window", () => {
    const f = new ClickFrenzy();
    const gap = FRENZY_WINDOW_MS / (FRENZY_CLICKS - 1) + 1;
    for (let i = 0; i < FRENZY_CLICKS * 3; i++)
      expect(f.click(i * gap)).toBe("bounce");
  });
  it("does not count clicks during a frenzy and needs a fresh run after", () => {
    const f = new ClickFrenzy();
    for (let i = 0; i < FRENZY_CLICKS; i++) f.click(i * 100);
    const start = (FRENZY_CLICKS - 1) * 100;
    expect(f.click(start + 100)).toBe("busy");
    expect(f.click(start + FRENZY_MS - 1)).toBe("busy");
    const after = start + FRENZY_MS;
    expect(f.active(after)).toBe(false);
    for (let i = 0; i < FRENZY_CLICKS - 1; i++)
      expect(f.click(after + i * 100)).toBe("bounce");
    expect(f.click(after + FRENZY_CLICKS * 100)).toBe("frenzy");
  });
});
