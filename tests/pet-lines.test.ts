import { expect, it } from "vitest";
import { petLines } from "../src/main/pet-lines";
import { restLines } from "../src/main/rest-lines";

it("provides exactly 365 distinct, nonempty cat messages", () => {
  expect(petLines).toHaveLength(365);
  expect(new Set(petLines).size).toBe(365);
  expect(petLines.every((line) => line.trim().length > 0)).toBe(true);
  expect(petLines.every((line) => / \(.+\)/u.test(line))).toBe(true);
});

it("provides exactly 365 distinct, nonempty rest reminders", () => {
  expect(restLines).toHaveLength(365);
  expect(new Set(restLines).size).toBe(365);
  expect(restLines.every((line) => line.trim().length > 0)).toBe(true);
  expect(restLines.every((line) => / \(.+\)/u.test(line))).toBe(true);
});
