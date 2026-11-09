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
  x: 5 / 8,
  y: 0.5,
};
export interface Daily {
  date: string;
  keys: number;
  clicks: number;
  workMs: number;
}
export interface Snapshot {
  daily: Daily;
  continuousMs: number;
  reminderUntil: number;
  reminderText: string;
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
export interface Bridge {
  snapshot: () => Promise<Snapshot>;
  subscribe: (fn: (s: Snapshot) => void) => () => void;
  input: (fn: (e: Input) => void) => () => void;
  meow: (fn: () => void) => () => void;
  update: (s: Partial<Settings>) => Promise<void>;
  interact: (action: "pet" | "dismiss" | "debug-hour") => void;
  quit: () => void;
}
declare global {
  interface Window {
    mengshu: Bridge;
  }
}
