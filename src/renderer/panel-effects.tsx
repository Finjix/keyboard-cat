// 右上角统计面板的特殊造型：每满 20 分钟连续工作换一种常规造型，
// 满 1 小时换成休息造型。每种造型都恰好两行，和正常面板一样高，
// 只在面板里面变化，不影响键盘和猫。动态造型全部是 CSS 动画。
import React, { ReactNode } from "react";
import type { PanelEffect } from "../shared/types";

export interface PanelData {
  keys: number;
  workMs: number;
  continuousMs: number;
  until: number;
  now: number;
}
export interface PanelLook {
  name: string;
  motion: boolean;
  /** Extra class on the panel itself (colour themes, whole-panel motion). */
  className?: string;
  render: (d: PanelData) => ReactNode;
}

const hm = (ms: number) =>
  `${Math.floor(ms / 3600000)} 时 ${Math.floor(ms / 60000) % 60} 分`;
const count = (n: number) => `${n.toLocaleString()} 次`;

const Row = ({ l, v }: { l: ReactNode; v?: ReactNode }) => (
  <div className="metric">
    <span>{l}</span>
    {v !== undefined && <strong>{v}</strong>}
  </div>
);
/** A small moving part inside an otherwise calm look. */
const M = ({ c, children }: { c: string; children: ReactNode }) => (
  <span className={"fx-m " + c}>{children}</span>
);
const Line = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => <div className={"metric fx-line " + className}>{children}</div>;
const Stats = ({
  d,
  l1 = "敲薯",
  l2 = "今日工作",
}: {
  d: PanelData;
  l1?: ReactNode;
  l2?: ReactNode;
}) => (
  <>
    <Row l={l1} v={count(d.keys)} />
    <Row l={l2} v={hm(d.workMs)} />
  </>
);
const Bar = ({ pct, className = "" }: { pct?: number; className?: string }) => (
  <span className={"fx-bar " + className}>
    <i style={pct === undefined ? undefined : { width: `${pct}%` }} />
  </span>
);
const Marquee = ({ text }: { text: string }) => (
  <Line className="fx-marquee">
    <span>
      {text}
      {text}
    </span>
  </Line>
);
const Wave = ({ text }: { text: string }) => (
  <span className="fx-wave">
    {[...text].map((c, i) => (
      <i key={i} style={{ animationDelay: `${i * 0.12}s` }}>
        {c}
      </i>
    ))}
  </span>
);
/** A little thing that walks or swims across one row. */
const Walker = ({ who, className }: { who: string; className: string }) => (
  <Line className="fx-track">
    <span className={className}>{who}</span>
  </Line>
);
const Reel = ({ delay }: { delay: number }) => (
  <span className="fx-reel">
    <span style={{ animationDelay: `${delay}s` }}>
      🍟
      <br />
      🐟
      <br />
      🐾
      <br />⭐<br />
      🍟
    </span>
  </span>
);
const Rain = ({ drop }: { drop: string }) => (
  <span className="fx-rain" aria-hidden="true">
    {[8, 30, 52, 74, 92].map((x, i) => (
      <i key={x} style={{ left: `${x}%`, animationDelay: `${i * 0.37}s` }}>
        {drop}
      </i>
    ))}
  </span>
);
const daysToWeekend = (now: number) => {
  const day = new Date(now).getDay();
  return day === 0 || day === 6 ? 0 : 6 - day;
};

export const funLooks: PanelLook[] = [
  {
    name: "薄荷",
    motion: false,
    className: "fx-mint",
    render: (d) => <Stats d={d} l1="🌿 敲薯" />,
  },
  {
    name: "樱花粉",
    motion: false,
    className: "fx-pink",
    render: (d) => <Stats d={d} l1="🐾 爪印" l2="陪伴时长" />,
  },
  {
    name: "猫语",
    motion: true,
    render: (d) => (
      <>
        <Row l="喵喵" v={<M c="fx-bob">{`${d.keys.toLocaleString()} 喵`}</M>} />
        <Row
          l="喵喵喵"
          v={`${Math.floor(d.workMs / 3600000)} 喵 ${Math.floor(d.workMs / 60000) % 60} 呜`}
        />
      </>
    ),
  },
  {
    name: "换算",
    motion: false,
    render: (d) => (
      <>
        <Row l="≈ 作文" v={`${Math.max(1, Math.round(d.keys / 800))} 篇`} />
        <Row l="≈ 番剧" v={`${Math.floor(d.workMs / 1440000)} 集`} />
      </>
    ),
  },
  {
    name: "今日运势",
    motion: true,
    render: () => (
      <>
        <Row
          l="今日运势"
          v={
            <>
              大吉 <M c="fx-spin">✦</M>
            </>
          }
        />
        <Row l="宜 摸猫" v="忌 加班" />
      </>
    ),
  },
  {
    name: "懵薯天气",
    motion: true,
    render: () => (
      <>
        <Row
          l="懵薯天气"
          v={
            <>
              <M c="fx-spin slow">☀</M> 晴
            </>
          }
        />
        <Row l="摸鱼指数" v="★★★★☆" />
      </>
    ),
  },
  {
    name: "今日特供",
    motion: true,
    className: "fx-cream",
    render: () => (
      <>
        <Row
          l="今日特供"
          v={
            <>
              <M c="fx-steam">♨</M>香酥薯饼
            </>
          }
        />
        <Row l="配料" v="二狗的爱" />
      </>
    ),
  },
  {
    name: "心情值",
    motion: true,
    render: () => (
      <>
        <Row l="懵薯心情" v="100%" />
        <Row l="饱腹度" v={<Bar className="fx-mood" />} />
      </>
    ),
  },
  {
    name: "专属认证",
    motion: true,
    className: "fx-gold",
    render: () => (
      <>
        <span className="fx-shine" aria-hidden="true" />
        <Row l="二狗专属" v="键盘 ✓" />
        <Row l="认证猫猫" v="懵薯" />
      </>
    ),
  },
  {
    name: "打字等级",
    motion: true,
    render: (d) => (
      <>
        <Row l="打字等级" v={`Lv.${Math.floor(d.keys / 200) + 1}`} />
        <Row
          l="经验"
          v={<Bar pct={((d.keys % 200) / 200) * 100} className="fx-shimmer" />}
        />
      </>
    ),
  },
  {
    name: "体温计",
    motion: true,
    render: () => (
      <>
        <Row
          l={
            <>
              <M c="fx-beat slow">🌡</M> 键盘温度
            </>
          }
          v="36.8℃"
        />
        <Row l="猫猫体温" v="38.5℃" />
      </>
    ),
  },
  {
    name: "周末倒数",
    motion: false,
    render: (d) => {
      const n = daysToWeekend(d.now);
      return (
        <>
          <Row l="距离周末" v={n ? `${n} 天` : "就是今天"} />
          <Row l="薯饼" v={n ? "再坚持下" : "玩个痛快"} />
        </>
      );
    },
  },
  {
    name: "颜文字",
    motion: true,
    className: "fx-face",
    render: () => (
      <>
        <Line>
          <M c="fx-eye">(=^･ω･^=)</M>
        </Line>
        <Line>
          <Wave text="喵~喵~" />
        </Line>
      </>
    ),
  },
  {
    name: "反色",
    motion: false,
    className: "fx-invert",
    render: (d) => <Stats d={d} />,
  },
  {
    name: "成就",
    motion: true,
    render: (d) => (
      <>
        <Row
          l={
            <>
              <M c="fx-hop">🏆</M> 成就
            </>
          }
          v="解锁"
        />
        <Row
          l={
            d.keys >= 100 ? `敲满 ${Math.floor(d.keys / 100) * 100}` : "新手村"
          }
          v={d.keys >= 100 ? "键盘侠" : "初来乍到"}
        />
      </>
    ),
  },
  {
    name: "跑马灯",
    motion: true,
    render: (d) => (
      <>
        <Marquee text="酥饼今天也超棒 · 懵薯陪你敲键盘 · " />
        <Row l="敲薯" v={count(d.keys)} />
      </>
    ),
  },
  {
    name: "幸运转盘",
    motion: true,
    render: () => (
      <>
        <Line>
          <Reel delay={0} />
          <Reel delay={0.25} />
          <Reel delay={0.5} />
        </Line>
        <Row l="今日好运" v="+1" />
      </>
    ),
  },
  {
    name: "霓虹",
    motion: true,
    className: "fx-neon",
    render: (d) => <Stats d={d} />,
  },
  {
    name: "彩虹",
    motion: true,
    className: "fx-rainbow",
    render: (d) => <Stats d={d} />,
  },
  {
    name: "心动值",
    motion: true,
    render: () => (
      <>
        <Row
          l={
            <>
              <b className="fx-beat">♥</b> 心动值
            </>
          }
          v="爆表"
        />
        <Row l="来自" v="懵薯" />
      </>
    ),
  },
  {
    name: "猫爪巡逻",
    motion: true,
    render: () => (
      <>
        <Walker who="🐾" className="fx-walk" />
        <Row l="懵薯" v="巡逻中" />
      </>
    ),
  },
  {
    name: "打字机",
    motion: true,
    render: () => (
      <>
        <Row
          l="懵薯"
          v={
            <>
              正在输入
              <span className="fx-dots" />
            </>
          }
        />
        <Line>
          <span className="fx-type">喵喵喵喵喵喵</span>
        </Line>
      </>
    ),
  },
  {
    name: "加载可爱",
    motion: true,
    render: () => (
      <>
        <Row l="加载可爱" v={<Bar className="fx-fill" />} />
        <Row l="请稍候" v={<span className="fx-dots" />} />
      </>
    ),
  },
  {
    name: "波浪",
    motion: true,
    render: () => (
      <>
        <Line>
          <Wave text="薯薯薯薯薯" />
        </Line>
        <Line>
          <Wave text="二狗加油鸭" />
        </Line>
      </>
    ),
  },
  {
    name: "小鱼游过",
    motion: true,
    render: () => (
      <>
        <Walker who="🐟" className="fx-swim" />
        <Row l="摸鱼时间" v="到" />
      </>
    ),
  },
  {
    name: "故障风",
    motion: true,
    className: "fx-glitch",
    render: (d) => <Stats d={d} l1="SYS·喵K" />,
  },
  {
    name: "闪闪发光",
    motion: true,
    render: () => (
      <>
        <Line>
          <span className="fx-twinkle">✦</span> 二狗闪闪发光{" "}
          <span className="fx-twinkle late">✧</span>
        </Line>
        <Line>
          <span className="fx-twinkle late">✧</span>
          <span className="fx-twinkle">✦</span>
          <span className="fx-twinkle late">✧</span>
        </Line>
      </>
    ),
  },
  {
    name: "键盘 BGM",
    motion: true,
    render: () => (
      <>
        <Row
          l="键盘 BGM"
          v={
            <span className="fx-eq">
              {[0, 0.2, 0.4, 0.1, 0.3].map((t) => (
                <i key={t} style={{ animationDelay: `${t}s` }} />
              ))}
            </span>
          }
        />
        <Row l="正在播放" v="呼噜声" />
      </>
    ),
  },
  {
    name: "薯饼雨",
    motion: true,
    render: (d) => (
      <>
        <Rain drop="🥔" />
        <Stats d={d} />
      </>
    ),
  },
  {
    name: "呼吸灯",
    motion: true,
    className: "fx-breathe",
    render: (d) => <Stats d={d} />,
  },
];

export const restLooks: PanelLook[] = [
  {
    name: "工作超时",
    motion: true,
    className: "fx-warn",
    render: () => (
      <>
        <Line>
          <M c="fx-flash">⚠</M> 工作超时
        </Line>
        <Line>请休息一下</Line>
      </>
    ),
  },
  {
    name: "电量低",
    motion: true,
    render: () => (
      <>
        <Row l="🔋 电量" v={<M c="fx-flash">5%</M>} />
        <Row l="请充电" v="休息=充电" />
      </>
    ),
  },
  {
    name: "补水",
    motion: true,
    className: "fx-water",
    render: () => (
      <>
        <Line>
          <M c="fx-drip">💧</M> 补水时间
        </Line>
        <Line>一杯就好</Line>
      </>
    ),
  },
  {
    name: "护眼",
    motion: true,
    render: () => (
      <>
        <Line>
          <M c="fx-look">👀</M> 看看远处
        </Line>
        <Line>坚持 20 秒</Line>
      </>
    ),
  },
  {
    name: "伸懒腰",
    motion: true,
    render: () => (
      <>
        <Line>
          <M c="fx-reach">🙆</M> 伸个懒腰
        </Line>
        <Line>全身舒展 ~</Line>
      </>
    ),
  },
  {
    name: "暂停营业",
    motion: false,
    className: "fx-closed",
    render: () => (
      <>
        <Line>暂停营业</Line>
        <Line>老板休息中</Line>
      </>
    ),
  },
  {
    name: "打烊",
    motion: false,
    className: "fx-night",
    render: () => (
      <>
        <Line>🌙 本店打烊</Line>
        <Line>十分钟后见</Line>
      </>
    ),
  },
  {
    name: "连续工作",
    motion: false,
    render: (d) => (
      <>
        <Row l="已连续工作" />
        <Row l="二狗" v={hm(d.continuousMs)} />
      </>
    ),
  },
  {
    name: "体力条",
    motion: true,
    render: () => (
      <>
        <Row l="体力" v={<Bar pct={15} className="low fx-flash" />} />
        <Row l="状态" v="需要回血" />
      </>
    ),
  },
  {
    name: "404",
    motion: false,
    className: "fx-invert",
    render: () => (
      <>
        <Line>ERROR 404</Line>
        <Line>精力未找到</Line>
      </>
    ),
  },
  {
    name: "红灯",
    motion: true,
    render: () => (
      <>
        <Line>
          <M c="fx-beat slow">🔴</M> 红灯停
        </Line>
        <Line>休息再出发</Line>
      </>
    ),
  },
  {
    name: "盯",
    motion: true,
    render: () => (
      <>
        <Line>懵薯盯着你</Line>
        <Line>
          <M c="fx-look">(¬_¬)</M> 快去
        </Line>
      </>
    ),
  },
  {
    name: "已存档",
    motion: false,
    render: () => (
      <>
        <Line>💾 已存档</Line>
        <Line>可以离开啦</Line>
      </>
    ),
  },
  {
    name: "酥饼过热",
    motion: true,
    className: "fx-hot",
    render: () => (
      <>
        <Line>
          酥饼过热 <M c="fx-flame">🔥</M>
        </Line>
        <Line>需要冷却</Line>
      </>
    ),
  },
  {
    name: "休息铃",
    motion: true,
    render: () => (
      <>
        <Line>
          <M c="fx-ring">⏰</M> 休息铃
        </Line>
        <Line>叮铃铃</Line>
      </>
    ),
  },
  {
    name: "警报",
    motion: true,
    className: "fx-alarm",
    render: () => (
      <>
        <Line>休息！</Line>
        <Line>休息！</Line>
      </>
    ),
  },
  {
    name: "电量告急",
    motion: true,
    render: () => (
      <>
        <Row l="🔋 电量" v={<Bar className="fx-drain low" />} />
        <Row l="电量告急" v="快充电" />
      </>
    ),
  },
  {
    name: "倒计时",
    motion: true,
    render: (d) => {
      const s = Math.max(0, Math.ceil((d.until - d.now) / 1000));
      return (
        <>
          <Row l="休息倒计时" />
          <Line className="fx-clock">
            {String(Math.floor(s / 60)).padStart(2, "0")}
            <span className="fx-colon">:</span>
            {String(s % 60).padStart(2, "0")}
          </Line>
        </>
      );
    },
  },
  {
    name: "休息跑马灯",
    motion: true,
    render: () => (
      <>
        <Marquee text="起来走走 · 喝口水 · 看看远处 · 伸个懒腰 · " />
        <Line>薯饼休息啦</Line>
      </>
    ),
  },
  {
    name: "呼吸引导",
    motion: true,
    render: () => (
      <>
        <Line>
          <span className="fx-orb" />
          <span className="fx-swap">
            <b>吸气…</b>
            <b>呼气…</b>
          </span>
        </Line>
        <Line>跟着节奏</Line>
      </>
    ),
  },
  {
    name: "接水",
    motion: true,
    className: "fx-water",
    render: () => (
      <>
        <Row l="💧 接水中" v={<Bar className="fx-fill blue" />} />
        <Line>接满就喝</Line>
      </>
    ),
  },
  {
    name: "眨眼",
    motion: true,
    render: () => (
      <>
        <Line>
          <span className="fx-blink">◉ ◉</span>
        </Line>
        <Line>眨眨眼睛</Line>
      </>
    ),
  },
  {
    name: "坐太久",
    motion: true,
    className: "fx-shake",
    render: () => (
      <>
        <Line>坐太久啦</Line>
        <Line>起来动动</Line>
      </>
    ),
  },
  {
    name: "犯困",
    motion: true,
    render: () => (
      <>
        <Line>
          犯困了
          <span className="fx-zzz">
            <i>z</i>
            <i>z</i>
            <i>Z</i>
          </span>
        </Line>
        <Line>眯一会儿</Line>
      </>
    ),
  },
  {
    name: "休息加载",
    motion: true,
    render: () => (
      <>
        <Line>休息加载中</Line>
        <Line>
          <Bar className="fx-fill wide" />
        </Line>
      </>
    ),
  },
  {
    name: "慢下来",
    motion: true,
    render: () => (
      <>
        <Line>
          <b className="fx-beat slow">♥</b> 慢下来
        </Line>
        <Line>深呼吸</Line>
      </>
    ),
  },
  {
    name: "去走走",
    motion: true,
    render: () => (
      <>
        <Walker who="🚶" className="fx-walk slow" />
        <Line>去走走吧</Line>
      </>
    ),
  },
  {
    name: "伸展",
    motion: true,
    render: () => (
      <>
        <Line>
          <span className="fx-stretch">伸——展——</span>
        </Line>
        <Line>拉伸一下</Line>
      </>
    ),
  },
  {
    name: "热茶",
    motion: true,
    render: () => (
      <>
        <Line>
          <span className="fx-steam">☕</span> 歇会儿
        </Line>
        <Line>喝杯热的</Line>
      </>
    ),
  },
  {
    name: "拍拍",
    motion: true,
    render: () => (
      <>
        <Line>
          <span className="fx-pat">🐾</span> 拍拍你
        </Line>
        <Line>二狗快休息</Line>
      </>
    ),
  },
];

/** The panel contents for an active effect, or null for the normal stats. */
export function panelLook(panel: PanelEffect | null, now: number) {
  if (!panel || now >= panel.until) return null;
  return (panel.mode === "rest" ? restLooks : funLooks)[panel.index] ?? null;
}
