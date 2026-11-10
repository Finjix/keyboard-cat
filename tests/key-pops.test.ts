import { describe, expect, it } from "vitest";
import { keys } from "../src/shared/keyboard";
import { KeyPops, popTexts, secretWords } from "../src/shared/key-pops";
import { MOD_ALT, MOD_CTRL, withModifiers } from "../src/shared/modifiers";
import { HeldKeys, STALE_KEY_MS } from "../src/shared/held-keys";

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
  it("keeps shortcuts while Windows says a modifier is still down", () => {
    const pops = new KeyPops(() => 0);
    // Hold Alt and keep tapping Tab: Alt stops auto-repeating, so the hook
    // bookkeeping drops it after STALE_KEY_MS. Windows still reports it down.
    const held = new HeldKeys();
    held.down(56, 0);
    held.sweep(STALE_KEY_MS + 1);
    expect(held.has(56)).toBe(false);
    expect(pops.press(15, withModifiers(held, MOD_ALT))).toEqual({
      text: "切换！",
      kind: "shortcut",
    });
    // Released for real (e.g. keyup lost on the secure desktop): no shortcut.
    expect(pops.press(46, withModifiers(held, 0)).kind).toBe("plain");
    // A Ctrl the hook just saw go down still counts before Windows catches up.
    held.down(29, 0);
    expect(pops.press(46, withModifiers(held, 0)).text).toBe("复制！");
    expect(pops.press(46, withModifiers(new HeldKeys(), MOD_CTRL)).kind).toBe(
      "shortcut",
    );
    // Without real state (older input process) only the hook counts.
    expect(withModifiers(held)).toBe(held);
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
  it("offers exactly 365 distinct keycap lines", () => {
    expect(popTexts.size).toBe(365);
    expect([...popTexts].every((t) => t.trim().length > 0)).toBe(true);
  });
  it("never celebrates press counts", () => {
    const pops = new KeyPops(() => 0);
    for (let i = 0; i < 1000; i++)
      expect(pops.press(code("K"), none).kind).toBe("plain");
  });
});
