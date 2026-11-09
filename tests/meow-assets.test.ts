import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

it("ships 30 cats plus 1 dog and 9 other clips with CC0 source records", () => {
  const root = resolve("src/renderer/assets/meows");
  const records = JSON.parse(
    readFileSync(resolve(root, "sources.json"), "utf8"),
  );
  expect(
    readdirSync(root).filter((name) => name.endsWith(".mp3")),
  ).toHaveLength(30);
  expect(records).toHaveLength(30);
  expect(new Set(records.map((r: any) => r.sha256)).size).toBe(30);
  expect(new Set(records.map((r: any) => r.source)).size).toBe(30);
  for (const record of records) {
    expect(record.license).toBe("CC0-1.0");
    expect(record.creator.length).toBeGreaterThan(0);
    const bytes = readFileSync(resolve(root, record.file));
    expect(bytes.length).toBeGreaterThan(2000);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      record.sha256,
    );
  }
  const extraRoot = resolve("src/renderer/assets/animals");
  const extras = JSON.parse(
    readFileSync(resolve(extraRoot, "sources.json"), "utf8"),
  );
  expect(
    readdirSync(extraRoot).filter((name) => name.endsWith(".mp3")),
  ).toHaveLength(10);
  expect(extras.filter((r: any) => r.category === "dog")).toHaveLength(1);
  expect(extras.filter((r: any) => r.category !== "dog")).toHaveLength(9);
  expect(new Set([...records, ...extras].map((r: any) => r.sha256)).size).toBe(
    40,
  );
  for (const record of extras) {
    expect(record.license).toBe("CC0-1.0");
    expect(record.creator.length).toBeGreaterThan(0);
    const bytes = readFileSync(resolve(extraRoot, record.file));
    expect(bytes.length).toBeGreaterThan(2000);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      record.sha256,
    );
  }
});
