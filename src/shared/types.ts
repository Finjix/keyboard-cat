export interface Settings {
  visible: boolean;
  paused: boolean;
  autoStart: boolean;
  displayId: number | null;
  area: number;
  x: number;
  y: number;
}
export const defaults: Settings = {
  visible: true,
  paused: false,
  autoStart: true,
  displayId: null,
  area: 0.625,
  x: 0.5,
  y: 0.5,
};
export interface Daily {
  date: string;
  keys: number;
  clicks: number;
  workMs: number;
}
/** Panel takeover: a fun look every 20 working minutes, a rest look at the hour. */
export type PanelMode = "fun" | "rest";
export const PANEL_EFFECT_COUNT = 30;
export interface PanelEffect {
  mode: PanelMode;
  index: number;
  until: number;
}
export interface Snapshot {
  stage: Stage | null;
  daily: Daily;
  continuousMs: number;
  reminderUntil: number;
  reminderText: string;
  panel: PanelEffect | null;
  speech: string;
  speechUntil: number;
  settings: Settings;
  desktopError: string;
  inputError: string;
}
export type Input = {
  type: "keydown" | "keyup" | "mousedown" | "mouseup" | "mousemove" | "wheel";
  keycode?: number;
  button?: number;
  x?: number;
  y?: number;
};
export type Action = "pet" | "frenzy" | "frenzy-end" | "dismiss" | "debug-hour";
/** Where the scene sits inside the full-work-area window (CSS px). */
export interface Stage {
  x: number;
  y: number;
  width: number;
  windowWidth: number;
  windowHeight: number;
}
export interface Bridge {
  snapshot: () => Promise<Snapshot>;
  subscribe: (fn: (s: Snapshot) => void) => () => void;
  input: (fn: (e: Input) => void) => () => void;
  meow: (fn: () => void) => () => void;
  update: (s: Partial<Settings>) => Promise<void>;
  interact: (action: Action) => void;
  quit: () => void;
}
declare global {
  interface Window {
    mengshu: Bridge;
  }
}
