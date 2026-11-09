// 按住的键会持续自动重复 keydown（Windows 默认最长约 1 秒首次延迟、之后约 30 次/秒）。
// 安全桌面（Ctrl+Alt+Del、UAC）或其他吞键场景会让全局钩子收不到 keyup：
// 超过 STALE_KEY_MS 没再收到重复的键，视为已在别处松开，避免猫爪卡在旧键上、
// 也避免下一次真实按下被误当成长按而漏计。
export const STALE_KEY_MS = 1500;

export class HeldKeys {
  private seen = new Map<number, number>();
  /** 记录一次 keydown；新按下（非自动重复）返回 true。 */
  down(code: number, now: number) {
    const last = this.seen.get(code);
    this.seen.set(code, now);
    return last === undefined || now - last >= STALE_KEY_MS;
  }
  up(code: number) {
    return this.seen.delete(code);
  }
  has(code: number) {
    return this.seen.has(code);
  }
  get size() {
    return this.seen.size;
  }
  /** 移除丢失 keyup 的键；有移除时返回 true。 */
  sweep(now: number) {
    let dropped = false;
    for (const [code, at] of this.seen)
      if (now - at >= STALE_KEY_MS) {
        this.seen.delete(code);
        dropped = true;
      }
    return dropped;
  }
  clear() {
    this.seen.clear();
  }
}
