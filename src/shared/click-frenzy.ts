// 连点猫触发“发癫”：短时间内点够次数就进入鬼畜模式，持续期间点击不再计数。
export const FRENZY_CLICKS = 5;
export const FRENZY_WINDOW_MS = 1500;
export const FRENZY_MS = 6000;

export type CatClick = "bounce" | "frenzy" | "busy";

export class ClickFrenzy {
  private clicks: number[] = [];
  private until = -Infinity;
  active(now: number) {
    return now < this.until;
  }
  click(now: number): CatClick {
    if (this.active(now)) return "busy";
    this.clicks = this.clicks.filter((at) => now - at < FRENZY_WINDOW_MS);
    this.clicks.push(now);
    if (this.clicks.length < FRENZY_CLICKS) return "bounce";
    // A fresh frenzy needs a fresh run of clicks after this one ends.
    this.clicks = [];
    this.until = now + FRENZY_MS;
    return "frenzy";
  }
  reset() {
    this.clicks = [];
    this.until = -Infinity;
  }
}
