import { expect, it } from "vitest";
import { Engine } from "../src/main/engine";
import { TypingBurst, fastTypingLines } from "../src/main/typing-burst";

const codes = [30, 31, 32, 33, 34, 35, 36, 37];
const run = (
  detector: TypingBurst,
  start: number,
  count: number,
  gap: number,
) =>
  Array.from({ length: count }, (_, i) =>
    detector.stroke(codes[i % codes.length], start + i * gap),
  );

it("reacts to sustained frantic multi-key input, not ordinary fast typing", () => {
  expect(run(new TypingBurst(), 0, 60, 110).some(Boolean)).toBe(false);
  expect(run(new TypingBurst(), 0, 60, 45).filter(Boolean)).toHaveLength(1);
  expect(fastTypingLines).toHaveLength(3);
  expect(fastTypingLines).toContain("敲慢一点，我要晕薯了~");
});

it("ignores one-key tapping, modifiers and instantaneous key chords", () => {
  const d = new TypingBurst();
  for (let i = 0; i < 60; i++) expect(d.stroke(30, i * 30)).toBe(false);
  const modifiers = new TypingBurst();
  for (let i = 0; i < 60; i++)
    expect(modifiers.stroke([29, 42, 54, 56, 3613, 3640][i % 6], i * 30)).toBe(
      false,
    );
  expect(run(new TypingBurst(), 0, 30, 0).some(Boolean)).toBe(false);
});

it("requires a quiet gap and cooldown before another meow", () => {
  const d = new TypingBurst();
  expect(run(d, 0, 24, 45).filter(Boolean)).toHaveLength(1);
  expect(run(d, 3000, 24, 45).some(Boolean)).toBe(false);
  expect(run(d, 5000, 120, 45).some(Boolean)).toBe(false);
  expect(run(d, 12000, 24, 45).filter(Boolean)).toHaveLength(1);
});

it("allows a new burst exactly three seconds after the previous alert", () => {
  for (const [start, expected] of [[2999, 0], [3000, 1]]) {
    const d = new TypingBurst();
    expect(run(d, 0, 24, 45).filter(Boolean)).toHaveLength(1);
    // Clear held/partial input as on resume; preserve the cooldown timestamp.
    d.reset();
    expect(run(d, start, 24, 45).filter(Boolean)).toHaveLength(expected);
  }
});

it("engine filters held-key repeats and clears partial bursts on stop", () => {
  const e = new Engine(0, Date.now());
  for (let i = 0; i < 60; i++)
    expect(
      e.input({ type: "keydown", keycode: codes[i % 8] }, i * 45, Date.now()),
    ).toBe(false);
  expect(e.daily.keys).toBe(8);
  e.stop(3000, Date.now());
  const results = [];
  for (let i = 0; i < 24; i++) {
    const keycode = codes[i % 8];
    results.push(
      e.input({ type: "keydown", keycode }, 4000 + i * 45, Date.now()),
    );
    e.input({ type: "keyup", keycode }, 4001 + i * 45, Date.now());
  }
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(e.daily.keys).toBe(32);
});
