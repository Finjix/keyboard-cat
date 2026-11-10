// 点猫的动作：普通点击上下弹一下；连点发癫时猫、键盘、两只爪子满屏乱飞，最后全部回到原位。
// 全部用 Web Animations（不是 CSSAnimation），打字加速调整播放速率时不会被改动。
import type { Arena } from "../shared/scene-layout";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]) =>
  list[Math.floor(Math.random() * list.length)];

/** Chance that a fresh key press (not auto-repeat) makes the cat bounce. */
export const KEY_BOUNCE_CHANCE = 0.022;

const EASINGS = [
  "cubic-bezier(.6,0,.3,1)",
  "cubic-bezier(.6,0,.3,1)",
  "cubic-bezier(.2,1.5,.4,1)",
  "ease-in-out",
];

type Hop = { offset: number; dx: number; dy: number; rot: number; s: number };
type Mover = {
  el: HTMLElement;
  cx: number;
  cy: number;
  w: number;
  h: number;
  hops: number;
  turn: number;
  spin: number;
  scale: [number, number];
  individual?: boolean;
};

/** Random waypoints that keep the element's centre inside the arena. */
function wander(m: Mover, arena: Arena): Hop[] {
  const hops: Hop[] = [{ offset: 0, dx: 0, dy: 0, rot: 0, s: 1 }];
  let rot = 0;
  const mx = Math.min(m.w * 0.3, (arena.right - arena.left) / 4),
    my = Math.min(m.h * 0.3, (arena.bottom - arena.top) / 4);
  for (let i = 0; i < m.hops; i++) {
    rot += Math.random() < m.spin ? pick([-360, 360]) : rand(-m.turn, m.turn);
    hops.push({
      offset: 0.03 + (i / (m.hops - 1)) * 0.84 + rand(-0.15, 0.15) / m.hops,
      dx: rand(arena.left + mx, arena.right - mx) - m.cx,
      dy: rand(arena.top + my, arena.bottom - my) - m.cy,
      rot,
      s: rand(m.scale[0], m.scale[1]),
    });
  }
  // Land home on a whole turn, so dropping the animation changes nothing.
  hops.push({
    offset: 1,
    dx: 0,
    dy: 0,
    rot: Math.round(rot / 360) * 360,
    s: 1,
  });
  return hops;
}
const frames = (hops: Hop[], individual = false): Keyframe[] =>
  hops.map((h) => {
    const t = `${h.dx.toFixed(1)}px`,
      u = `${h.dy.toFixed(1)}px`,
      r = `${h.rot.toFixed(1)}deg`,
      s = h.s.toFixed(2);
    return individual
      ? {
          offset: h.offset,
          easing: pick(EASINGS),
          translate: `${t} ${u}`,
          rotate: r,
          scale: s,
        }
      : {
          offset: h.offset,
          easing: pick(EASINGS),
          transform: `translate(${t}, ${u}) rotate(${r}) scale(${s})`,
        };
  });

export function createCatMotion(scene: HTMLElement) {
  let bounce: Animation[] = [];
  let frenzy: Animation[] = [];
  const $ = (s: string) => scene.querySelector<HTMLElement>(s);
  const stop = (list: Animation[]) => list.forEach((a) => a.cancel());
  const clear = () => {
    stop(frenzy);
    frenzy = [];
  };

  return {
    get busy() {
      return frenzy.length > 0;
    },
    bounce() {
      if (
        frenzy.length ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return;
      stop(bounce);
      const el = $(".cat");
      if (!el) return;
      const opts = { duration: 340, easing: "ease-out" };
      bounce = [
        el.animate(
          [
            { transform: "translateY(0)" },
            { transform: "translateY(-26px)", offset: 0.35 },
            { transform: "translateY(5px)", offset: 0.7 },
            { transform: "translateY(0)" },
          ],
          opts,
        ),
      ];
      // Paws ride along a little so the body does not detach from the arms.
      scene
        .querySelectorAll<HTMLElement>(".paw")
        .forEach((paw) =>
          bounce.push(
            paw.animate(
              [
                { translate: "0 0" },
                { translate: "0 -10px", offset: 0.35 },
                { translate: "0 2px", offset: 0.7 },
                { translate: "0 0" },
              ],
              opts,
            ),
          ),
        );
    },
    /** Shake in place while the window grows. */
    windup() {
      stop(bounce);
      bounce = [];
      clear();
      const el = $(".cat");
      if (el)
        frenzy.push(
          el.animate(
            [
              { transform: "translate(0, 0) rotate(0deg)" },
              { transform: "translate(-16px, -12px) rotate(-6deg)" },
              { transform: "translate(14px, 4px) rotate(5deg)" },
              { transform: "translate(-6px, -26px) rotate(3deg)" },
              { transform: "translate(0, 0) rotate(0deg)" },
            ],
            { duration: 160, iterations: Infinity },
          ),
        );
    },
    /** Cat, keyboard and both paws fly around the arena, then come home. */
    roam(arena: Arena, ms: number) {
      clear();
      const movers: Mover[] = [];
      const box = (el: HTMLElement) => ({
        el,
        cx: el.offsetLeft + el.offsetWidth / 2,
        cy: el.offsetTop + el.offsetHeight / 2,
        w: el.offsetWidth,
        h: el.offsetHeight,
      });
      const cat = $(".cat"),
        keyboard = $(".keyboard");
      if (cat)
        movers.push({
          ...box(cat),
          hops: 10,
          turn: 70,
          spin: 0.2,
          scale: [0.5, 1],
        });
      if (keyboard)
        // Flung around like a frisbee.
        movers.push({
          ...box(keyboard),
          hops: 9,
          turn: 220,
          spin: 0.35,
          scale: [0.45, 0.95],
        });
      scene.querySelectorAll<HTMLElement>(".paw").forEach((paw) =>
        movers.push({
          el: paw,
          // Paws hang from their anchor point: translate(-50%, -97%).
          cx: paw.offsetLeft,
          cy: paw.offsetTop - paw.offsetHeight * 0.47,
          w: paw.offsetWidth,
          h: paw.offsetHeight,
          hops: 14,
          turn: 160,
          spin: 0.25,
          scale: [0.8, 1.5],
          individual: true,
        }),
      );
      for (const m of movers)
        frenzy.push(
          m.el.animate(frames(wander(m, arena), m.individual), {
            duration: ms,
          }),
        );
      // The desk shadow belongs under a keyboard that is no longer there.
      const shadow = $(".desk-shadow");
      if (shadow)
        frenzy.push(
          shadow.animate(
            [
              { opacity: 1 },
              { opacity: 0, offset: 0.08 },
              { opacity: 0, offset: 0.9 },
              { opacity: 1 },
            ],
            { duration: ms },
          ),
        );
      const mine = frenzy;
      return Promise.allSettled(mine.map((a) => a.finished)).then(() => {
        if (frenzy === mine) clear();
      });
    },
    reset() {
      stop(bounce);
      bounce = [];
      clear();
    },
  };
}
