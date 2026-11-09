import { Daily, Input } from "../shared/types";
import { restLines } from "./rest-lines";
export const IDLE = 300_000,
  HOUR = 3_600_000,
  BUBBLE = 1_800_000;
export const dateKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export class Engine {
  daily: Daily;
  continuousMs = 0;
  reminderUntil = 0;
  reminderText = "";
  private last: number | null = null;
  private cursor: number;
  private wall: number;
  private next = HOUR;
  private down = new Set<number>();
  private buttons = new Set<number>();
  constructor(mono: number, wall: number, saved?: Daily) {
    this.cursor = mono;
    this.wall = wall;
    this.daily =
      saved?.date === dateKey(wall)
        ? { ...saved }
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
      if (mono - this.last >= IDLE) {
        this.last = null;
        this.continuousMs = 0;
        this.next = HOUR;
        this.down.clear();
        this.buttons.clear();
      }
    }
    this.cursor = mono;
    this.wall = wall;
    this.ensureDay(wall);
    if (wall >= this.reminderUntil) this.reminderUntil = 0;
  }
  private ensureDay(wall: number) {
    if (this.daily.date !== dateKey(wall))
      this.daily = { date: dateKey(wall), keys: 0, clicks: 0, workMs: 0 };
  }
  remind(wall: number) {
    const choices = restLines.filter((line) => line !== this.reminderText);
    this.reminderText = choices[Math.floor(Math.random() * choices.length)];
    this.reminderUntil = wall + BUBBLE;
  }
  input(e: Input, mono: number, wall: number) {
    this.tick(mono, wall);
    this.last = mono;
    if (e.type === "keydown" && e.keycode !== undefined) {
      if (!this.down.has(e.keycode)) this.daily.keys++;
      this.down.add(e.keycode);
    }
    if (e.type === "keyup") this.down.delete(e.keycode!);
    if (e.type === "mousedown") {
      if (!this.buttons.has(e.button!)) this.daily.clicks++;
      this.buttons.add(e.button!);
    }
    if (e.type === "mouseup") this.buttons.delete(e.button!);
  }
  stop(mono: number, wall: number) {
    this.tick(mono, wall);
    this.last = null;
    this.continuousMs = 0;
    this.next = HOUR;
    this.down.clear();
    this.buttons.clear();
  }
}
