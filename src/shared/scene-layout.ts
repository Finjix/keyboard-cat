import type { Stage } from "./types";

export const SCENE_W = 1440;
export const SCENE_H = 960;

/**
 * Top-left corner (CSS px) and scale of the 1440×960 scene inside the
 * full-work-area window. If the window has not yet caught up with a new
 * stage (display change), the stage is scaled to the window rather than
 * jumping; with no stage at all the scene is centred.
 */
export function sceneLayout(w: number, h: number, stage: Stage | null) {
  if (stage) {
    const f = w / stage.windowWidth || 1;
    return { x: stage.x * f, y: stage.y * f, k: (stage.width / SCENE_W) * f };
  }
  const k = Math.min(w / SCENE_W, h / SCENE_H);
  return { x: (w - SCENE_W * k) / 2, y: (h - SCENE_H * k) / 2, k };
}

/** The whole window, in scene coordinates. */
export function sceneArena(w: number, h: number, stage: Stage | null) {
  const { x, y, k } = sceneLayout(w, h, stage);
  return {
    left: -x / k,
    top: -y / k,
    right: (w - x) / k,
    bottom: (h - y) / k,
  };
}
export type Arena = ReturnType<typeof sceneArena>;
