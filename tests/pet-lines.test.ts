import { expect, it } from "vitest";
import { petLines } from "../src/main/pet-lines";
import { restLines } from "../src/main/rest-lines";

it("provides exactly 520 distinct, nonempty cat messages", () => {
  expect(petLines).toHaveLength(520);
  expect(new Set(petLines).size).toBe(520);
  expect(petLines.every((line) => line.trim().length > 0)).toBe(true);
  expect(petLines.every((line) => / \(.+\)/u.test(line))).toBe(true);
});

it("provides exactly 1314 distinct, nonempty rest reminders", () => {
  expect(restLines).toHaveLength(1314);
  expect(new Set(restLines).size).toBe(1314);
  expect(restLines.every((line) => line.trim().length > 0)).toBe(true);
  expect(restLines.every((line) => / \(.+\)/u.test(line))).toBe(true);
});

it("calls the owner by every nickname", () => {
  for (const lines of [petLines, restLines])
    for (const name of ["二狗", "薯饼", "酥饼"])
      expect(lines.some((line) => line.includes(name))).toBe(true);
});
