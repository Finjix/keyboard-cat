// 待机摆动与面板造型的帧率控制。
//
// Idle sway moves the cat 4px and the paws ~3px over six seconds: ten frames a
// second look the same as sixty, but every frame the compositor draws costs
// the GPU process. The keyframes are sampled on one shared 100ms grid, and
// all three animations change in the same frame, so the window repaints ten
// times a second instead of sixty (faster when typing speeds them up).
//
// Panel looks are tiny and run for ten minutes at a time; they advance on a
// 20fps clock instead of every vsync.

/** One idle frame; every idle animation duration is a whole multiple. */
export const IDLE_STEP_MS = 100;
/** Panel looks advance this often. */
export const PANEL_FRAME_MS = 50;

const n3 = (v: number) => +v.toFixed(3);

/** `pose(w)`: CSS declarations at sway weight w (0 rest → 1 peak → 0). */
export function idleKeyframes(
  name: string,
  durationMs: number,
  pose: (w: number) => string,
) {
  const steps = Math.round(durationMs / IDLE_STEP_MS);
  if (steps * IDLE_STEP_MS !== durationMs)
    throw Error(`${name}: duration must be a multiple of ${IDLE_STEP_MS}ms`);
  let css = `@keyframes ${name}{`;
  for (let i = 0; i <= steps; i++) {
    // Cosine ease: slow at rest and at the peak, like ease-in-out.
    const w = (1 - Math.cos((2 * Math.PI * i) / steps)) / 2;
    css += `${+((i / steps) * 100).toFixed(5)}%{${pose(n3(w))}}`;
  }
  return css + "}";
}

const paw = (w: number) =>
  `translate:${n3(1.2 * w)}px ${n3(-2.8 * w)}px;rotate:${n3(-0.5 + 1.1 * w)}deg`;

/** Durations must match style.css (.cat 6.8s, .paw 5.8s, .paw.right 6.6s). */
export const idleCss = [
  idleKeyframes("cat-breathe", 6800, (w) => `translate:0 ${n3(-4 * w)}px`),
  idleKeyframes("paw-idle", 5800, paw),
  idleKeyframes("paw-idle-right", 6600, paw),
].join("\n");

export function installIdleKeyframes(doc: Document = document) {
  // Dev hot reload runs this module again; keep a single copy.
  doc.head.querySelector("style[data-idle-motion]")?.remove();
  const style = doc.createElement("style");
  style.dataset.idleMotion = "";
  style.textContent = idleCss;
  doc.head.append(style);
}

const idleAnimations = (scene: ParentNode) =>
  Array.from(scene.querySelectorAll(".cat, .paw")).flatMap((el) =>
    el
      .getAnimations()
      .filter((a): a is CSSAnimation => a instanceof CSSAnimation),
  );

/**
 * Put the idle animations back on one step grid. A paw pauses while it
 * presses a key and resumes off-grid; nudging it by under half a step (at
 * most one ~0.2px frame) lets all three change in the same frame again.
 */
export function alignIdleMotion(scene: ParentNode) {
  const running = idleAnimations(scene).filter(
    (a) => a.playState === "running",
  );
  const base = Number(running[0]?.currentTime);
  if (!Number.isFinite(base)) return;
  for (const a of running.slice(1)) {
    const t = Number(a.currentTime);
    if (!Number.isFinite(t)) continue;
    let d = (base - t) % IDLE_STEP_MS;
    if (d > IDLE_STEP_MS / 2) d -= IDLE_STEP_MS;
    else if (d < -IDLE_STEP_MS / 2) d += IDLE_STEP_MS;
    if (Math.abs(d) > 0.5) a.currentTime = t + d;
  }
}

/** Typing tempo for the idle sway; playback-rate updates keep each phase. */
export function setIdlePace(scene: ParentNode, pace: number) {
  alignIdleMotion(scene);
  for (const a of idleAnimations(scene)) a.updatePlaybackRate(pace);
}

/**
 * Drive the panel look's CSS animations from a 20fps clock. `paused()` true
 * (scene covered by other windows) freezes them without drawing anything.
 */
export function drivePanelMotion(root: Element, paused: () => boolean) {
  let elapsed = 0,
    last = performance.now();
  const tick = () => {
    const now = performance.now();
    if (!paused()) elapsed += now - last;
    last = now;
    for (const a of root.getAnimations({ subtree: true })) {
      if (!(a instanceof CSSAnimation)) continue;
      if (a.playState !== "paused") a.pause();
      if (a.currentTime !== elapsed) a.currentTime = elapsed;
    }
  };
  tick();
  const timer = window.setInterval(tick, PANEL_FRAME_MS);
  return () => window.clearInterval(timer);
}
