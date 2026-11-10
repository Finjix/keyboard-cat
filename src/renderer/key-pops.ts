// 键帽飘字的 DOM 层：一次性元素 + CSS 动画，结束即移除，不用逐帧 JavaScript。
// 只有文字，没有声音；猫叫仍完全沿用原有逻辑。
import { keys } from "../shared/keyboard";
import { keySurface } from "../shared/keyboard-art";
import { projectKeyboardPoint } from "../shared/keyboard-view";
import { KeyPops } from "../shared/key-pops";
import type { Input } from "../shared/types";
import { HeldKeys } from "../shared/held-keys";
import { FRENZY_MS } from "../shared/click-frenzy";

const MAX_POPS = 60;
const PLAIN_GAP_MS = 35;
const LIFE = {
  plain: 950,
  special: 1100,
  shortcut: 1300,
  word: 1700,
  milestone: 1900,
};
const COLORS = [
  "#e8885a",
  "#d9a43a",
  "#6f9a4f",
  "#4f8fb3",
  "#c06b9b",
  "#8a74c9",
  "#d0675f",
];
const MOTIONS = ["rise", "hop", "wobble"];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]) =>
  list[Math.floor(Math.random() * list.length)];

export function createKeyPopLayer(layer: HTMLElement, scene: HTMLElement) {
  const pops = new KeyPops();
  const held = new HeldKeys();
  let lastPlain = 0;
  // While the keyboard is kicked away, key pops would float over empty desk.
  let quietUntil = 0;

  const centre = (code: number) => {
    const key = keys.find((k) => k.code === code);
    if (!key) return undefined;
    const s = keySurface(key);
    return projectKeyboardPoint(s.x + s.w / 2, s.y + s.h / 2);
  };

  function spawn(
    text: string,
    cls: string,
    x: number,
    y: number,
    life: number,
  ) {
    if (layer.childElementCount >= MAX_POPS) layer.firstElementChild?.remove();
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--dx", `${rand(-36, 36).toFixed(1)}px`);
    el.style.setProperty("--spin", `${rand(-16, 16).toFixed(1)}deg`);
    el.style.setProperty("--color", pick(COLORS));
    el.style.setProperty("--life", `${life}ms`);
    layer.append(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
    // Fallback in case the animation never runs (e.g. hidden window).
    window.setTimeout(() => el.remove(), life + 200);
  }

  return {
    input(e: Input) {
      if (e.keycode === undefined) return;
      if (e.type === "keyup") {
        held.up(e.keycode);
        return;
      }
      if (e.type !== "keydown") return;
      const now = performance.now();
      // Drop modifiers whose key-up was swallowed (Ctrl+Alt+Del, UAC), so a
      // stale Ctrl does not turn every later "C" into a copy shortcut.
      held.sweep(now);
      if (held.has(e.keycode)) {
        held.down(e.keycode, now);
        return;
      }
      const pop = pops.press(e.keycode, held);
      held.down(e.keycode, now);
      if (now < quietUntil) return;
      if (pop.kind === "plain") {
        if (now - lastPlain < PLAIN_GAP_MS) return;
        lastPlain = now;
      }
      const p = centre(e.keycode);
      if (!p) return;
      spawn(
        pop.text,
        `key-pop ${pop.kind} ${pick(MOTIONS)}`,
        p.x,
        p.y - 8,
        LIFE[pop.kind],
      );
    },
    /** Small hearts where the cat was petted; client coordinates. */
    pet(clientX: number, clientY: number) {
      const r = scene.getBoundingClientRect();
      const k = r.width / scene.offsetWidth;
      const x = (clientX - r.left) / k,
        y = (clientY - r.top) / k;
      for (let i = 0; i < 4; i++)
        spawn(
          pick(["♥", "♡", "🐾", "♥"]),
          "key-pop heart rise",
          x + rand(-18, 18),
          y,
          1000,
        );
    },
    /** Frenzy: the keyboard is away, so keycap pops pause meanwhile. */
    frenzy() {
      quietUntil = performance.now() + FRENZY_MS;
    },
    reset() {
      held.clear();
      pops.reset();
    },
    destroy() {
      layer.replaceChildren();
    },
  };
}
