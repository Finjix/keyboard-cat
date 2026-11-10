// 叫声洗牌袋：每轮把全部录音打乱后依次取出，取完再洗；新一轮的第一声不与上一声相同。
// 连续叫（发癫）时也因此一声接一声都不一样。
export class ClipBag<T> {
  private bag: T[] = [];
  private last: T | undefined;
  constructor(
    private readonly clips: readonly T[],
    private readonly random: () => number = Math.random,
  ) {}
  next(): T {
    if (!this.bag.length) {
      const bag = [...this.clips];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // Clips are taken from the end: keep the previous clip off the top.
      if (bag.length > 1 && bag[bag.length - 1] === this.last)
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      this.bag = bag;
    }
    this.last = this.bag.pop()!;
    return this.last;
  }
}
