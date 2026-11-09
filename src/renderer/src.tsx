import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { defaults, Snapshot, Input } from "../shared/types";
import { keys } from "../shared/keyboard";
import { keySurface } from "../shared/keyboard-art";
import { keyboardView, projectKeyboardPoint } from "../shared/keyboard-view";
import keyboardArt from "./assets/keyboard.png";
import cat from "./assets/cat.png";
import leftPaw from "./assets/paw-left.png";
import rightPaw from "./assets/paw-right.png";
import "./style.css";
import { createMeowPlayer } from "./meow";
import { createKeyPopLayer } from "./key-pops";
import "./key-pops.css";
const initial: Snapshot = {
  daily: { date: "", keys: 0, clicks: 0, workMs: 0 },
  continuousMs: 0,
  reminderUntil: 0,
  reminderText: "",
  speech: "",
  speechUntil: 0,
  settings: defaults,
  desktopError: "",
  inputError: "",
};
const duration = (ms: number) =>
  `${Math.floor(ms / 3600000)} 时 ${Math.floor(ms / 60000) % 60} 分`;
function App() {
  const scene = useRef<HTMLDivElement>(null);
  const [s, set] = useState(initial),
    [pressed, setPressed] = useState<number[]>([]),
    [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  function performAction(action: string) {
    window.mengshu.interact(action as "pet" | "dismiss" | "debug-hour");
  }
  useEffect(() => {
    const meow = createMeowPlayer();
    const offMeow = window.mengshu.meow(() => {
      void meow.play().catch((error) => console.warn("猫叫播放失败", error));
    });
    window.mengshu.snapshot().then(set);
    const off = window.mengshu.subscribe(set);
    const held = new Set<number>();
    let strokes: number[] = [];
    let pace = 1;
    let motionTimer: number | undefined;
    const stopMotionTimer = () => {
      window.clearInterval(motionTimer);
      motionTimer = undefined;
    };
    const applyPace = () => {
      // Playback-rate updates preserve animation phase, avoiding a jump when
      // typing accelerates. No per-frame JavaScript or permanent idle timer.
      scene.current?.querySelectorAll(".cat, .paw").forEach((el) => {
        el.getAnimations().forEach(
          (animation) =>
            animation instanceof CSSAnimation &&
            animation.updatePlaybackRate(pace),
        );
      });
      scene.current?.style.setProperty(
        "--paw-move-ms",
        `${110 / Math.sqrt(pace)}ms`,
      );
    };
    const updatePace = () => {
      const now = performance.now();
      strokes = strokes.filter((at) => now - at < 1800);
      const target = 1 + Math.min(strokes.length / 12, 1) * 4;
      pace += (target - pace) * 0.28;
      if (Math.abs(target - pace) < 0.025) pace = target;
      applyPace();
      if (strokes.length === 0 && pace === 1) stopMotionTimer();
    };
    const input = window.mengshu.input((e: Input) => {
      if (e.type === "keydown") {
        if (!held.has(e.keycode!)) {
          held.add(e.keycode!);
          strokes.push(performance.now());
          // Tick at most ten times per second while typing and settling.
          if (motionTimer === undefined) {
            updatePace();
            motionTimer = window.setInterval(updatePace, 100);
          }
        }
        setPressed((a) => [...a.filter((x) => x !== e.keycode), e.keycode!]);
      }
      if (e.type === "keyup") {
        held.delete(e.keycode!);
        setPressed((a) => a.filter((x) => x !== e.keycode));
      }
    });
    const reset = () => {
      setPressed([]);
      held.clear();
      strokes = [];
      pace = 1;
      stopMotionTimer();
      applyPace();
    };
    const resize = () => setSize({ w: innerWidth, h: innerHeight });
    let mask: HTMLCanvasElement | null = null;
    const click = (e: Event) => {
      const p = (e as CustomEvent).detail;
      const el = document
        .elementFromPoint(p.x, p.y)
        ?.closest<HTMLElement>("[data-action]");
      if (el instanceof HTMLImageElement) {
        if (!mask) {
          mask = document.createElement("canvas");
          mask.width = el.naturalWidth;
          mask.height = el.naturalHeight;
          mask.getContext("2d")!.drawImage(el, 0, 0);
        }
        const r = el.getBoundingClientRect(),
          scale = Math.min(
            r.width / el.naturalWidth,
            r.height / el.naturalHeight,
          );
        const x = Math.floor(
            (p.x - r.left - (r.width - el.naturalWidth * scale) / 2) / scale,
          ),
          y = Math.floor(
            (p.y - r.top - (r.height - el.naturalHeight * scale) / 2) / scale,
          );
        if (
          x < 0 ||
          y < 0 ||
          x >= mask.width ||
          y >= mask.height ||
          mask.getContext("2d")!.getImageData(x, y, 1, 1).data[3] < 50
        )
          return;
      }
      if (el?.dataset.action === "pet")
        window.dispatchEvent(new CustomEvent("key-pops-pet", { detail: p }));
      if (el) performAction(el.dataset.action!);
    };
    window.addEventListener("desktop-click", click);
    window.addEventListener("reset-input", reset);
    window.addEventListener("resize", resize);
    return () => {
      offMeow();
      meow.close();
      off();
      input();
      stopMotionTimer();
      window.removeEventListener("desktop-click", click);
      window.removeEventListener("reset-input", reset);
      window.removeEventListener("resize", resize);
    };
  }, []);
  const popLayer = useRef<HTMLDivElement>(null);
  // 键帽飘字固定开启，没有开关。
  useEffect(() => {
    if (!popLayer.current || !scene.current) return;
    const layer = createKeyPopLayer(popLayer.current, scene.current);
    const offInput = window.mengshu.input(layer.input);
    const pet = (e: Event) => {
      const p = (e as CustomEvent<{ x: number; y: number }>).detail;
      layer.pet(p.x, p.y);
    };
    const reset = () => layer.reset();
    window.addEventListener("key-pops-pet", pet);
    window.addEventListener("reset-input", reset);
    return () => {
      offInput();
      window.removeEventListener("key-pops-pet", pet);
      window.removeEventListener("reset-input", reset);
      layer.destroy();
    };
  }, []);
  const scale = Math.min(size.w / 1440, size.h / 960),
    latest = (left: boolean) =>
      [...pressed]
        .reverse()
        .map((c) => keys.find((k) => k.code === c))
        .find((k) => k && (left ? k.x < 7.5 : k.x >= 7.5));
  const l = latest(true),
    r = latest(false);
  // Side flags refer to the screen. The front-facing cat's right paw is on
  // screen-left (R), and its left paw is on screen-right (main keyboard +/=).
  const restR = keys.find((key) => key.code === 19)!;
  const restPlus = keys.find((key) => key.code === 13)!;
  const pawStyle = (k: typeof l, right = false) => {
    const rest = keySurface(right ? restPlus : restR);
    const target = keySurface(k ?? (right ? restPlus : restR));
    const { x, y } = projectKeyboardPoint(
      target.x + target.w / 2,
      target.y + target.h / 2,
    );
    const origin = projectKeyboardPoint(
      rest.x + rest.w / 2,
      rest.y + rest.h / 2,
    );
    // Lean gently into the reach, with the paw tip remaining at the key.
    const reach = Math.max(
      -7,
      Math.min(7, (origin.x - x) * 0.022 + (y - origin.y) * 0.015),
    );
    return {
      left: x,
      top: y,
      transform: `translate(-50%,-97%) rotate(${((right ? -5 : 5) + reach).toFixed(2)}deg) scale(${k ? 0.96 : 1})`,
    };
  };
  return (
    <div
      ref={scene}
      className="scene"
      style={{ transform: `translate(-50%,-50%) scale(${scale})` }}
    >
      <img className="cat" src={cat} data-action="pet" draggable={false} />
      <div className="desk-shadow" />
      <div
        className="keyboard"
        style={{
          left: keyboardView.left,
          top: keyboardView.top,
          width: keyboardView.width,
          height: keyboardView.height,
        }}
      >
        <img
          className="keyboard-art"
          src={keyboardArt}
          alt="透视立体键盘"
          draggable={false}
        />
        <section className="stats" aria-label="今日统计">
          <div className="stats-display">
            <div className="metric">
              <span>敲薯</span>
              <strong>{s.daily.keys.toLocaleString()} 次</strong>
            </div>
            <div className="metric">
              <span>今日工作</span>
              <strong>{duration(s.daily.workMs)}</strong>
            </div>
          </div>
          {(s.desktopError || s.inputError) && (
            <aside>{s.desktopError || s.inputError}</aside>
          )}
        </section>
        {keys.map((k) => (
          <div
            key={k.code}
            data-key={k.code}
            className={"key " + (pressed.includes(k.code) ? "pressed" : "")}
            style={{
              left: keySurface(k).x,
              top: keySurface(k).y,
              width: keySurface(k).w,
              height: keySurface(k).h,
            }}
          />
        ))}
      </div>
      <img
        className={"paw" + (l ? " is-active" : "")}
        src={leftPaw}
        alt="猫的右爪"
        style={pawStyle(l)}
        draggable={false}
      />
      <img
        className={"paw right" + (r ? " is-active" : "")}
        src={rightPaw}
        alt="猫的左爪"
        style={pawStyle(r, true)}
        draggable={false}
      />

      {s.reminderUntil > 0 ? (
        <div className="speech rest-speech" role="status">
          <div className="rest-message">{s.reminderText}</div>
          <div className="rest-footer">
            <span>休息一下吧~</span>
            <button
              className="rest-dismiss"
              data-action="dismiss"
              onClick={() => performAction("dismiss")}
            >
              我知道了
            </button>
          </div>
        </div>
      ) : s.speech ? (
        <div className="speech pet-speech">{s.speech}</div>
      ) : null}
      <div ref={popLayer} className="pop-layer" aria-hidden="true" />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
