import {
  Daily,
  Input,
  PANEL_EFFECT_COUNT,
  PanelEffect,
  PanelMode,
} from "../shared/types";
import { restLines } from "./rest-lines";
import { TypingBurst } from "./typing-burst";
import { HeldKeys } from "../shared/held-keys";
export const IDLE = 300_000,
  HOUR = 3_600_000,
  BUBBLE = 1_800_000,
  PANEL_EVERY = 1_200_000,
  PANEL_FOR = 600_000;
export const dateKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export class Engine {
  daily: Daily;
  continuousMs = 0;
  reminderUntil = 0;
  reminderText = "";
  panel: PanelEffect | null = null;
  private panelStep = 0;
  private lastPanel: Record<PanelMode, number> = { fun: -1, rest: -1 };
  private last: number | null = null;
  private cursor: number;
  private wall: number;
  private next = HOUR;
  private down = new HeldKeys();
  private buttons = new Set<number>();
  private typingBurst = new TypingBurst();
  constructor(mono: number, wall: number, saved?: Daily) {
    this.cursor = mono;
    this.wall = wall;
    const count = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
    // A hand-edited or truncated state.json must not leak NaN into the panel.
    this.daily =
      saved?.date === dateKey(wall)
        ? {
            date: saved.date,
            keys: count(saved.keys),
            clicks: count(saved.clicks),
            workMs: count(saved.workMs),
          }
        : { date: dateKey(wall), keys: 0, clicks: 0, workMs: 0 };
  }
  tick(mono: number, wall: number) {
    const end =
      this.last === null ? this.cursor : Math.min(mono, this.last + IDLE);
    let amount = Math.max(0, end - this.cursor);
    let at = this.wall;
    while (amount > 0) {
      const d = new Date(at);
      const midnight = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() + 1,
      ).getTime();
      const n = Math.min(amount, midnight - at);
      this.ensureDay(at);
      this.daily.workMs += n;
      amount -= n;
      at += n;
    }
    if (this.last !== null) {
      this.continuousMs += Math.max(0, end - this.cursor);
      if (this.continuousMs >= this.next) {
        this.remind(wall);
        this.next = (Math.floor(this.continuousMs / HOUR) + 1) * HOUR;
      }
      // Every 20 working minutes the panel dresses up; the hour belongs to rest.
      const step = Math.floor(this.continuousMs / PANEL_EVERY);
      if (step > this.panelStep) {
        this.panelStep = step;
        if (step % 3 !== 0) this.showPanel("fun", wall);
      }
      if (mono - this.last >= IDLE) {
        this.last = null;
        this.continuousMs = 0;
        this.next = HOUR;
        this.panelStep = 0;
        this.down.clear();
        this.buttons.clear();
        this.typingBurst.reset();
      }
    }
    this.cursor = mono;
    this.wall = wall;
    this.ensureDay(wall);
    if (wall >= this.reminderUntil) this.reminderUntil = 0;
    if (this.panel && wall >= this.panel.until) this.panel = null;
  }
  private ensureDay(wall: number) {
    if (this.daily.date !== dateKey(wall))
      this.daily = { date: dateKey(wall), keys: 0, clicks: 0, workMs: 0 };
  }
  remind(wall: number, restIndex?: number) {
    const choices = restLines.filter((line) => line !== this.reminderText);
    this.reminderText = choices[Math.floor(Math.random() * choices.length)];
    this.reminderUntil = wall + BUBBLE;
    this.showPanel("rest", wall, restIndex);
  }
  /** `index` picks a look on purpose (tray debug); otherwise a fresh random one. */
  showPanel(mode: PanelMode, wall: number, index?: number) {
    if (index === undefined) {
      // Never the same look twice in a row.
      const last = this.lastPanel[mode];
      index = Math.floor(
        Math.random() * (last < 0 ? PANEL_EFFECT_COUNT : PANEL_EFFECT_COUNT - 1),
      );
      if (last >= 0 && index >= last) index++;
    }
    this.lastPanel[mode] = index;
    this.panel = { mode, index, until: wall + PANEL_FOR };
  }
  /** "我知道了" also takes the rest look off the panel. */
  dismiss() {
    this.reminderUntil = 0;
    if (this.panel?.mode === "rest") this.panel = null;
  }
  input(e: Input, mono: number, wall: number) {
    this.tick(mono, wall);
    this.last = mono;
    let burst = false;
    if (e.type === "keydown" && e.keycode !== undefined) {
      if (this.down.down(e.keycode, mono)) {
        this.daily.keys++;
        burst = this.typingBurst.stroke(e.keycode, mono);
      }
    }
    if (e.type === "keyup") this.down.up(e.keycode!);
    if (e.type === "mousedown") {
      if (!this.buttons.has(e.button!)) this.daily.clicks++;
      this.buttons.add(e.button!);
    }
    if (e.type === "mouseup") this.buttons.delete(e.button!);
    return burst;
  }
  stop(mono: number, wall: number) {
    this.tick(mono, wall);
    this.last = null;
    this.continuousMs = 0;
    this.next = HOUR;
    this.panelStep = 0;
    this.down.clear();
    this.buttons.clear();
    this.typingBurst.reset();
  }
}
