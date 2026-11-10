import { describe, expect, it } from "vitest";
import { ClipBag } from "../src/shared/clip-bag";

describe("叫声洗牌袋", () => {
  it("plays every clip once per round, never the same twice in a row", () => {
    const clips = Array.from({ length: 40 }, (_, i) => `clip-${i}`);
    const bag = new ClipBag(clips);
    let last = "";
    for (let round = 0; round < 50; round++) {
      const seen = new Set<string>();
      for (let i = 0; i < clips.length; i++) {
        const clip = bag.next();
        expect(clip).not.toBe(last);
        seen.add(clip);
        last = clip;
      }
      expect(seen.size).toBe(clips.length);
    }
  });
  it("keeps the round boundary fresh even with a fixed roll", () => {
    const bag = new ClipBag(["a", "b", "c"], () => 0.5);
    const order = Array.from({ length: 12 }, () => bag.next());
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  });
});
