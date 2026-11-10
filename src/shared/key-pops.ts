// 键帽飘字：每次新按下，从键帽上冒出一个小词。
// 普通键只出随机拟声词，绝不显示真实按下的字母，旁人看不出你打了什么。
// 暗号只在内存里匹配最近十几个字母数字，不保存、不上报。
import { keys } from "./keyboard";

export type PopKind = "plain" | "special" | "shortcut" | "word";
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
  "砰",
  "咣",
  "嗡",
  "嘣",
  "啾",
  "叽",
  "哔",
  "噌",
  "唰",
  "嘶",
  "啪嗒",
  "哒哒",
  "吧唧",
  "咕噜",
  "噼啪",
  "滴答",
  "叮咚",
  "咔哒",
  "嘀嗒",
  "咕咚",
  "扑通",
  "哗啦",
  "叮当",
  "嘟嘟",
  "啪啪",
  "咚咚",
  "叮叮",
  "噗噜",
  "啵啵",
  "嗒嗒",
  "嘀嘀",
  "咻咻",
  "噔噔",
  "哐当",
  "啪叽",
  "吧嗒",
  "咕嘟",
  "嘎吱",
  "叽叽",
  "哔哔",
  "呲溜",
  "嗖嗖",
  "噌噌",
  "唰唰",
  "咚哒",
  "啪哒",
  "噗嗤",
  "咕叽",
  "嘟噜",
  "哒哒哒",
  "噼里啪啦",
  "叮叮当",
  "咕噜噜",
  "啪嗒嗒",
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
  "喵喵",
  "喵！",
  "咪咪",
  "呼噜噜",
  "舔舔",
  "蹭蹭",
  "踩奶",
  "揣手",
  "伸爪",
  "摇尾巴",
  "竖耳朵",
  "眯眼",
  "打滚",
  "弓背",
  "喵嗷",
  "肉垫",
  // 薯味，和使用者的昵称
  "薯",
  "薯薯",
  "好薯",
  "薯了",
  "二狗",
  "二狗冲",
  "二狗稳",
  "二狗好样的",
  "薯饼",
  "薯饼+1",
  "薯饼真棒",
  "香香薯饼",
  "酥饼",
  "酥饼稳",
  "酥饼加油",
  "酥酥脆",
  "香酥",
  "饼饼",
  "嘎嘣脆",
  "刚出炉",
  "热乎乎",
  "香喷喷",
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
  "漂亮",
  "稳了",
  "可以",
  "不错",
  "顺",
  "丝滑",
  "流畅",
  "好手速",
  "灵",
  "对味",
  "有了",
  "加速",
  "继续",
  "优雅",
  "专注",
  "在线",
  "牛",
];

const SHIFT_LINES = ["嘿咻", "换挡", "举起来"];
const CTRL_LINES = ["按住~", "Ctrl~", "蓄力中"];
const ALT_LINES = ["Alt~", "备用键"];
const WIN_LINES = ["开始！", "窗户喵", "开窗户"];
const SPECIAL: Record<number, string[]> = {
  1: ["溜了溜了", "逃！", "跑路", "酥饼退下吧", "撤！", "二狗快跑"],
  59: ["救命！", "求助喵", "薯饼求助"],
  60: ["改名！", "起个好名"],
  61: ["搜搜看"],
  63: ["刷新！", "再来一次", "焕然一新"],
  87: ["全屏！", "大屏模式"],
  88: ["开发者喵", "偷看源码"],
  14: ["撤回", "删删删", "薯饼无事发生", "后悔药", "退格喵", "我没打过", "当没看见", "酥饼手滑了"],
  15: ["切！", "跳！", "缩进", "下一格"],
  28: ["发射！", "冲！", "确认！", "回车喵", "二狗走你", "就决定是你了", "发出去啦", "二狗确认"],
  3612: ["算好啦", "等于！", "结果出炉"],
  58: ["大声！", "啊啊啊", "大写喵", "别喊啦"],
  42: SHIFT_LINES,
  54: SHIFT_LINES,
  29: CTRL_LINES,
  3613: CTRL_LINES,
  56: ALT_LINES,
  3640: ALT_LINES,
  3675: WIN_LINES,
  3676: WIN_LINES,
  3677: ["菜单喵", "点菜"],
  57: ["咚！", "空格", "大空格", "嘭", "顿一下", "懵薯！", "留白", "歇一拍", "二狗！", "薯饼！", "酥饼！"],
  3667: ["删！", "删库跑路", "拜拜~", "消失术"],
  3666: ["插队！", "插个楼"],
  3655: ["回家喵", "回到开头"],
  3663: ["到底了", "完结撒花"],
  3657: ["往上翻", "翻回去"],
  3665: ["往下翻", "翻篇"],
  57416: ["上上", "冲上去"],
  57424: ["下下", "沉下去"],
  57419: ["左左", "退退退", "往左挪"],
  57421: ["右右", "往右挪"],
  3639: ["咔嚓！", "截图喵", "茄子！", "别拍丑了"],
  70: ["滚滚", "锁住滚轮"],
  3653: ["暂停一下", "喘口气"],
  69: ["数字喵", "数字开关"],
};

const CTRL = new Set([29, 3613]);
const ALT = new Set([56, 3640]);
const WIN = new Set([3675, 3676]);
const SHORTCUTS: { mod: Set<number>; code: number; lines: string[] }[] = [
  { mod: CTRL, code: 46, lines: ["复制！", "抄下来", "二狗抄作业"] },
  { mod: CTRL, code: 47, lines: ["粘贴！", "贴贴", "贴上啦"] },
  { mod: CTRL, code: 45, lines: ["剪！", "咔嚓剪掉"] },
  { mod: CTRL, code: 44, lines: ["时光倒流", "撤回撤回", "反悔啦"] },
  { mod: CTRL, code: 21, lines: ["重做！", "再来亿遍"] },
  { mod: CTRL, code: 31, lines: ["存好啦，薯饼安心~", "已保存 ✓", "薯饼存档成功"] },
  { mod: CTRL, code: 30, lines: ["酥饼全都要！", "一网打尽"] },
  { mod: CTRL, code: 33, lines: ["找找看", "懵薯帮你找"] },
  { mod: CTRL, code: 35, lines: ["替换！"] },
  { mod: CTRL, code: 25, lines: ["打印喵"] },
  { mod: CTRL, code: 49, lines: ["新的开始"] },
  { mod: CTRL, code: 24, lines: ["打开！"] },
  { mod: CTRL, code: 48, lines: ["加粗！"] },
  { mod: CTRL, code: 32, lines: ["收藏喵"] },
  { mod: CTRL, code: 17, lines: ["关掉关掉"] },
  { mod: CTRL, code: 20, lines: ["新标签！"] },
  { mod: CTRL, code: 19, lines: ["重新加载"] },
  { mod: ALT, code: 15, lines: ["切换！", "溜号~", "换个窗口"] },
  { mod: ALT, code: 62, lines: ["二狗再见喵！", "酥饼要走了吗"] },
  { mod: WIN, code: 32, lines: ["回桌面看懵薯！"] },
  { mod: WIN, code: 38, lines: ["二狗去吧，懵薯看家"] },
  { mod: WIN, code: 18, lines: ["打开文件夹"] },
  { mod: WIN, code: 47, lines: ["剪贴板喵"] },
];

const LAUGH = ["哈哈哈哈"];
export const secretWords: Record<string, string[]> = {
  ergou: ["二狗在此！", "二狗好！", "叫二狗干嘛~"],
  shubing: ["薯饼出炉！", "薯饼是我的人"],
  subing: ["酥饼来啦~", "酥饼最酥了", "酥饼脆脆的"],
  moyu: ["摸鱼被懵薯发现了 🐟", "一起摸！🐟"],
  laoban: ["嘘，老板来了", "老板好！"],
  xiaban: ["下班！冲鸭！", "薯饼下班快乐~"],
  jiaban: ["加班？懵薯心疼你", "二狗加班辛苦啦"],
  "666": ["666！", "六六六"],
  hhhh: LAUGH,
  hahaha: LAUGH,
  awsl: ["啊我死了 ♥"],
  kfc: ["V 我 50 🍗"],
  niubi: ["牛哇牛哇"],
  yyds: ["YYDS！"],
  meow: ["喵？叫我？"],
  miaomiao: ["喵喵在此"],
  mengshu: ["在呢在呢！", "叫懵薯干嘛~"],
  shushu: ["薯薯是我主人哦", "薯薯让我陪你~"],
  qifei: ["芜湖起飞 🛫"],
  daka: ["已打卡 ✓"],
  wuwu: ["酥饼不哭，抱抱"],
  shuijiao: ["晚安喵 💤"],
  chifan: ["二狗干饭！🍚"],
  heshui: ["二狗喝水好习惯 💧"],
  xiuxi: ["薯饼休息一下嘛"],
  jiayou: ["薯饼加油！懵薯挺你"],
  nihao: ["薯饼你好呀~"],
  xiexie: ["不客气喵，酥饼"],
  zaoan: ["早安酥饼！☀️"],
  wanan: ["晚安二狗~"],
  bug: ["又有 bug 了喵", "bug 退散"],
  kaixin: ["开心就好！"],
  leile: ["累了就歇歇"],
  kunle: ["困了？眯一会儿"],
  emo: ["不 emo，懵薯抱"],
  zhoumo: ["周末万岁！"],
  fangjia: ["放假啦！"],
  gongzi: ["发工资啦 💰"],
  naicha: ["奶茶续命 🧋"],
  kafei: ["咖啡因到账 ☕"],
  xixi: ["嘻嘻"],
  love: ["爱你哟 ♥"],
  cat: ["喵！在说我吗"],
  dog: ["狗？二狗吗"],
  zaijian: ["拜拜啦~"],
  baobao: ["抱抱！"],
  tietie: ["贴贴贴贴！"],
  mua: ["mua~ 亲一口"],
  hello: ["Hello 喵~"],
  thanks: ["不用谢喵"],
  sorry: ["没关系喵"],
  okok: ["好的好的"],
  lgtm: ["准了！"],
  shangxian: ["上线顺利！"],
  fabu: ["发布成功 🎉"],
  ceshi: ["测试通过 ✓"],
  kaihui: ["开会辛苦啦"],
  zhoubao: ["周报写完了吗"],
  deadline: ["别慌，稳住"],
  ddl: ["DDL 冲刺！"],
  gogogo: ["冲冲冲！"],
  wuhu: ["芜湖~"],
  yeah: ["耶！"],
  nice: ["Nice 喵"],
  maomao: ["猫猫在此"],
  xiangni: ["懵薯也想你"],
  dagong: ["打工人加油！"],
  fadian: ["发癫中勿扰"],
  mengle: ["懵了懵了"],
};
const secretCodes = Object.keys(secretWords).sort(
  (a, b) => b.length - a.length,
);
export const SECRET_BUFFER = 16;

/** Every distinct line a keycap can show; shared lists count once. */
export const popTexts = new Set(
  [
    PLAIN,
    ...Object.values(SPECIAL),
    ...SHORTCUTS.map((s) => s.lines),
    ...Object.values(secretWords),
  ].flat(),
);

const labels = new Map(keys.map((k) => [k.code, k.label]));

export class KeyPops {
  private typed = "";
  constructor(private random: () => number = Math.random) {}

  private pick<T>(list: readonly T[]) {
    return list[Math.floor(this.random() * list.length)];
  }

  /** `held` holds the keys already down before this new press. */
  press(code: number, held: { has(code: number): boolean }): Pop {
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
    const special = SPECIAL[code];
    if (special) return { text: this.pick(special), kind: "special" };
    return { text: this.pick(PLAIN), kind: "plain" };
  }

  reset() {
    this.typed = "";
  }
}
