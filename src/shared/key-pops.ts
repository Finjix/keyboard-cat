// 键帽飘字：每次新按下，从键帽上冒出一个小词。
// 普通键只出随机拟声词，绝不显示真实按下的字母，旁人看不出你打了什么。
// 暗号只在内存里匹配最近十几个字母数字，不保存、不上报。
import { keys } from "./keyboard";

export type PopKind = "plain" | "special" | "shortcut" | "word" | "milestone";
export interface Pop {
  text: string;
  kind: PopKind;
}

const PLAIN = [
  // 拟声词占大头，保持轻快。
  "啪",
  "哒",
  "咚",
  "嗒",
  "噗",
  "叮",
  "乓",
  "啵",
  "咻",
  "嘀",
  "咔",
  "哐",
  "嗖",
  "噔",
  "嘟",
  "叭",
  "啪嗒",
  "哒哒",
  "吧唧",
  "咕噜",
  "噼啪",
  "滴答",
  "啪",
  "哒",
  "咚",
  "嗒",
  "噗",
  "叮",
  // 猫味
  "喵",
  "喵~",
  "喵呜",
  "咪",
  "呼噜",
  "嗷呜",
  "踩踩",
  "爪！",
  "🐾",
  // 薯味
  "薯",
  "薯薯",
  "好薯",
  "薯了",
  // 打气
  "冲",
  "稳",
  "妙",
  "好耶",
  "绝",
  "帅",
  "认真",
  "✓",
  "+1",
];

const SPECIAL: Record<number, string[]> = {
  1: ["溜了溜了", "逃！", "跑路", "退下吧"],
  59: ["救命！", "求助喵"],
  60: ["改名！"],
  63: ["刷新！", "再来一次"],
  87: ["全屏！"],
  88: ["开发者喵"],
  14: ["撤回", "删删删", "无事发生", "后悔药", "退格喵"],
  15: ["切！", "跳！", "缩进"],
  28: ["发射！", "冲！", "确认！", "回车喵", "走你"],
  3612: ["发射！", "确认！", "算好啦"],
  58: ["大声！", "啊啊啊", "大写喵"],
  42: ["嘿咻", "换挡"],
  54: ["嘿咻", "换挡"],
  29: ["按住~", "Ctrl~"],
  3613: ["按住~", "Ctrl~"],
  56: ["Alt~"],
  3640: ["Alt~"],
  3675: ["开始！", "窗户喵"],
  3676: ["开始！", "窗户喵"],
  3677: ["菜单喵"],
  57: ["咚！", "空格", "大空格", "嘭", "顿一下", "懵薯！"],
  3667: ["删！", "删库跑路", "拜拜~"],
  3666: ["插队！"],
  3655: ["回家喵"],
  3663: ["到底了", "完结撒花"],
  3657: ["往上翻"],
  3665: ["往下翻"],
  57416: ["上上"],
  57424: ["下下"],
  57419: ["左左", "退退退"],
  57421: ["右右"],
  3639: ["咔嚓！", "截图喵"],
  70: ["滚滚"],
  3653: ["暂停一下", "喘口气"],
  69: ["数字喵"],
};

// 修饰键 + 键：Ctrl（29/3613）、Alt（56/3640）、Win（3675/3676）。
const CTRL = new Set([29, 3613]);
const ALT = new Set([56, 3640]);
const WIN = new Set([3675, 3676]);
const SHORTCUTS: { mod: Set<number>; code: number; lines: string[] }[] = [
  { mod: CTRL, code: 46, lines: ["复制！", "抄下来"] },
  { mod: CTRL, code: 47, lines: ["粘贴！", "贴贴"] },
  { mod: CTRL, code: 45, lines: ["剪！", "咔嚓剪掉"] },
  { mod: CTRL, code: 44, lines: ["时光倒流", "撤回撤回"] },
  { mod: CTRL, code: 21, lines: ["重做！"] },
  { mod: CTRL, code: 31, lines: ["存好啦，安心~", "已保存 ✓"] },
  { mod: CTRL, code: 30, lines: ["全都要！"] },
  { mod: CTRL, code: 33, lines: ["找找看"] },
  { mod: CTRL, code: 25, lines: ["打印喵"] },
  { mod: CTRL, code: 49, lines: ["新的开始"] },
  { mod: CTRL, code: 17, lines: ["关掉关掉"] },
  { mod: CTRL, code: 20, lines: ["新标签！"] },
  { mod: CTRL, code: 19, lines: ["刷新！"] },
  { mod: ALT, code: 15, lines: ["切换！", "溜号~"] },
  { mod: ALT, code: 62, lines: ["再见喵！"] },
  { mod: WIN, code: 32, lines: ["回桌面看懵薯！"] },
  { mod: WIN, code: 38, lines: ["锁屏啦，懵薯看家"] },
];

// 打出这些拼音或英文时冒出对应的话，输入法里打拼音也算。
export const secretWords: Record<string, string[]> = {
  moyu: ["摸鱼被懵薯发现了 🐟", "一起摸！🐟"],
  laoban: ["嘘，老板来了", "老板好！"],
  xiaban: ["下班！冲鸭！", "下班快乐~"],
  jiaban: ["加班？懵薯心疼你", "加班辛苦啦"],
  "666": ["666！", "六六六"],
  hhhh: ["哈哈哈哈"],
  hahaha: ["哈哈哈哈"],
  awsl: ["啊我死了 ♥"],
  kfc: ["V 我 50 🍗"],
  niubi: ["牛哇牛哇"],
  yyds: ["YYDS！"],
  meow: ["喵？叫我？"],
  miaomiao: ["喵喵在此"],
  mengshu: ["在呢在呢！", "叫懵薯干嘛~"],
  shushu: ["薯薯在此"],
  qifei: ["芜湖起飞 🛫"],
  daka: ["已打卡 ✓"],
  wuwu: ["抱抱不哭"],
  shuijiao: ["晚安喵 💤"],
  chifan: ["干饭！🍚"],
  heshui: ["喝水好习惯 💧"],
  xiuxi: ["休息一下嘛"],
  jiayou: ["加油！懵薯挺你"],
  nihao: ["你好呀~"],
  xiexie: ["不客气喵"],
  zaoan: ["早安！☀️"],
  wanan: ["晚安~"],
  bug: ["又有 bug 了喵", "bug 退散"],
};
const secretCodes = Object.keys(secretWords).sort(
  (a, b) => b.length - a.length,
);
export const SECRET_BUFFER = 16;
export const MILESTONE = 500;

const labels = new Map(keys.map((k) => [k.code, k.label]));

export class KeyPops {
  private typed = "";
  private presses = 0;
  constructor(private random: () => number = Math.random) {}

  private pick<T>(list: readonly T[]) {
    return list[Math.floor(this.random() * list.length)];
  }

  /** `held` holds the keys already down before this new press. */
  press(code: number, held: ReadonlySet<number>): Pop {
    this.presses++;
    const label = labels.get(code) ?? "";
    if (/^[A-Za-z0-9]$/.test(label))
      this.typed = (this.typed + label.toLowerCase()).slice(-SECRET_BUFFER);

    const shortcut = SHORTCUTS.find(
      (s) => s.code === code && [...s.mod].some((m) => held.has(m)),
    );
    if (shortcut) return { text: this.pick(shortcut.lines), kind: "shortcut" };

    const word = secretCodes.find((c) => this.typed.endsWith(c));
    if (word) {
      this.typed = "";
      return { text: this.pick(secretWords[word]), kind: "word" };
    }
    if (this.presses % MILESTONE === 0)
      return { text: `本次第 ${this.presses} 敲！`, kind: "milestone" };
    const special = SPECIAL[code];
    if (special) return { text: this.pick(special), kind: "special" };
    return { text: this.pick(PLAIN), kind: "plain" };
  }

  reset() {
    this.typed = "";
  }
}
