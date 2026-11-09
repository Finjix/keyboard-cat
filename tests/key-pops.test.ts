import { describe, expect, it } from "vitest";
import { keys } from "../src/shared/keyboard";
import { KeyPops, MILESTONE, secretWords } from "../src/shared/key-pops";

const code = (label: string) => keys.find((k) => k.label === label)!.code;
const none = new Set<number>();
const type = (pops: KeyPops, text: string) =>
  [...text].map((ch) => pops.press(code(ch.toUpperCase()), none)).at(-1)!;

describe("键帽飘字", () => {
  it("never shows the real letter or digit that was pressed", () => {
    const pops = new KeyPops();
    for (let i = 0; i < 400; i++)
      for (const label of ["A", "S", "D", "1", "Q"]) {
        const { text } = pops.press(code(label), none);
        expect(text.trim().toUpperCase()).not.toBe(label);
      }
  });
  it("gives special keys and shortcuts their own lines", () => {
    const pops = new KeyPops(() => 0);
    expect(pops.press(28, none)).toEqual({ text: "发射！", kind: "special" });
    expect(pops.press(46, new Set([29]))).toEqual({
      text: "复制！",
      kind: "shortcut",
    });
    expect(pops.press(32, new Set([3675])).text).toBe("回桌面看懵薯！");
  });
  it("answers pinyin and English words, then starts over", () => {
    const pops = new KeyPops(() => 0);
    expect(type(pops, "jintianmoyu")).toEqual({
      text: secretWords.moyu[0],
      kind: "word",
    });
    expect(type(pops, "xiaban").text).toBe(secretWords.xiaban[0]);
    expect(pops.press(code("U"), none).kind).toBe("plain");
  });
  it("celebrates every few hundred presses", () => {
    const pops = new KeyPops(() => 0);
    let last;
    for (let i = 0; i < MILESTONE; i++) last = pops.press(code("K"), none);
    expect(last).toEqual({
      text: `本次第 ${MILESTONE} 敲！`,
      kind: "milestone",
    });
  });
});
