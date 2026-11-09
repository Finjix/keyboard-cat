export const BURST_WINDOW_MS = 1500;
export const BURST_COOLDOWN_MS = 3000;
const modifiers = new Set([29, 3613, 42, 54, 56, 3640, 3675, 3676, 58, 69, 70]);
export const fastTypingLines = [
  "敲慢一点，我要晕薯了~",
  "爪子要打结啦，再敲这么快真的要薯了~",
  "键盘快冒烟啦，给懵薯留口喘气的时间嘛~",
];

export class TypingBurst {
  private strokes: { at: number; code: number }[] = [];
  private lastAlert = -Infinity;
  private lastStroke = -Infinity;
  private armed = true;
  stroke(code: number, now: number) {
    if (modifiers.has(code)) return false;
    if (now - this.lastStroke >= 1200 && now - this.lastAlert >= BURST_COOLDOWN_MS)
      this.armed = true;
    this.lastStroke = now;
    this.strokes = this.strokes.filter((s) => now - s.at < BURST_WINDOW_MS);
    this.strokes.push({ at: now, code });
    if (
      !this.armed ||
      now - this.lastAlert < BURST_COOLDOWN_MS ||
      this.strokes.length < 24 ||
      now - this.strokes[0].at < 700 ||
      new Set(this.strokes.map((s) => s.code)).size < 6
    )
      return false;
    this.lastAlert = now;
    this.armed = false;
    this.strokes = [];
    return true;
  }
  reset() {
    this.strokes = [];
    this.lastStroke = -Infinity;
    this.armed = true;
  }
}
