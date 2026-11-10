import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { defaults, Snapshot, Input, Action } from "../shared/types";
import { sceneArena, sceneLayout } from "../shared/scene-layout";
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
import { panelLook } from "./panel-effects";
import "./panel-effects.css";
import { HeldKeys } from "../shared/held-keys";
import { ClickFrenzy, FRENZY_MS } from "../shared/click-frenzy";
import { createCatMotion, KEY_BOUNCE_CHANCE } from "./cat-motion";
import {
  alignIdleMotion,
  drivePanelMotion,
  installIdleKeyframes,
  setIdlePace,
} from "./idle-motion";
installIdleKeyframes();
const keyByCode = new Map(keys.map((k) => [k.code, k]));
// Invisible anchors for paws and tests. Memoized so a held key's auto-repeat
// or the once-a-second state push does not re-render all 104 of them.
const KeyAnchors = React.memo(function KeyAnchors({
  pressed,
}: {
  pressed: number[];
}) {
  return (
    <>
      {keys.map((k) => {
        const r = keySurface(k);
        return (
          <div
            key={k.code}
            data-key={k.code}
            className={pressed.includes(k.code) ? "key pressed" : "key"}
            style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
          />
        );
      })}
    </>
  );
});
const initial: Snapshot = {
  stage: null,
  daily: { date: "", keys: 0, clicks: 0, workMs: 0 },
  continuousMs: 0,
  reminderUntil: 0,
  reminderText: "",
  panel: null,
  speech: "",
  speechUntil: 0,
  settings: defaults,
  covered: false,
  desktopError: "",
  inputError: "",
};
const duration = (ms: number) =>
  `${Math.floor(ms / 3600000)} 时 ${Math.floor(ms / 60000) % 60} 分`;
function App() {
  const scene = useRef<HTMLDivElement>(null);
  const [s, set] = useState(initial),
    [pressed, setPressed] = useState<number[]>([]),
    [size, setSize] = useState({ w: innerWidth, h: innerHeight }),
    [frenzy, setFrenzy] = useState(false),
    stage = useRef(s.stage),
    covered = useRef(s.covered);
  stage.current = s.stage;
  covered.current = s.covered;
  function performAction(action: string) {
    window.mengshu.interact(action as Action);
  }
  useEffect(() => {
    const meow = createMeowPlayer();
    const offMeow = window.mengshu.meow(() => {
      void meow.play().catch((error) => console.warn("猫叫播放失败", error));
    });
    window.mengshu.snapshot().then(set);
    const off = window.mengshu.subscribe(set);
    const held = new HeldKeys();
    let strokes: number[] = [];
    let sweepTimer: number | undefined;
    const stopSweep = () => {
      window.clearInterval(sweepTimer);
      sweepTimer = undefined;
    };
    // Release keys whose key-up never arrived so the paw returns to rest.
    const sweep = () => {
      if (held.sweep(performance.now()))
        setPressed((a) => a.filter((c) => held.has(c)));
      if (!held.size) stopSweep();
    };
    let pace = 1;
    let motionTimer: number | undefined;
    const stopMotionTimer = () => {
      window.clearInterval(motionTimer);
      motionTimer = undefined;
    };
    const applyPace = () => {
      // Playback-rate updates preserve animation phase, avoiding a jump when
      // typing accelerates. No per-frame JavaScript or permanent idle timer.
      if (scene.current) setIdlePace(scene.current, pace);
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
      const code = e.keycode;
      if (code === undefined) return;
      if (e.type === "keydown") {
        const now = performance.now();
        if (held.down(code, now)) {
          strokes.push(now);
          if (!covered.current && Math.random() < KEY_BOUNCE_CHANCE)
            motion.bounce();
          // Tick at most ten times per second while typing and settling.
          if (motionTimer === undefined) {
            updatePace();
            motionTimer = window.setInterval(updatePace, 100);
          }
        }
        sweepTimer ??= window.setInterval(sweep, 500);
        // Auto-repeat of the newest key changes nothing: keep the same array.
        setPressed((a) =>
          a[a.length - 1] === code ? a : [...a.filter((x) => x !== code), code],
        );
      }
      if (e.type === "keyup") {
        held.up(code);
        setPressed((a) => (a.includes(code) ? a.filter((x) => x !== code) : a));
      }
    });
    const reset = () => {
      setPressed([]);
      held.clear();
      strokes = [];
      pace = 1;
      stopMotionTimer();
      stopSweep();
      applyPace();
    };
    const resize = () => {
      // Lay out in this very frame, not one frame late at the wrong spot.
      flushSync(() => setSize({ w: innerWidth, h: innerHeight }));
    };
    let mask: CanvasRenderingContext2D | null = null;
    const catClicks = new ClickFrenzy();
    const motion = createCatMotion(scene.current!);
    let frenzyTimer: number | undefined;
    let frenzyRun = 0;
    const startFrenzy = async () => {
      const run = ++frenzyRun;
      const started = performance.now();
      setFrenzy(true);
      window.dispatchEvent(new Event("key-pops-frenzy"));
      performAction("frenzy");
      const done = () => {
        if (run === frenzyRun) setFrenzy(false);
      };
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        frenzyTimer = window.setTimeout(done, FRENZY_MS);
        return;
      }
      // A short shake in place, then everyone takes off. The window already
      // covers the whole work area, so nothing is resized.
      motion.windup();
      await new Promise((r) => (frenzyTimer = window.setTimeout(r, 300)));
      if (run !== frenzyRun) return;
      const arena = sceneArena(innerWidth, innerHeight, stage.current);
      await motion.roam(arena, FRENZY_MS - (performance.now() - started));
      if (run !== frenzyRun) return;
      done();
      performAction("frenzy-end");
    };
    const click = (e: Event) => {
      const p = (e as CustomEvent).detail;
      const el = document
        .elementFromPoint(p.x, p.y)
        ?.closest<HTMLElement>("[data-action]");
      if (el instanceof HTMLImageElement) {
        // Build the alpha mask only from a decoded image; a 0x0 mask cached
        // from an early click would make the cat unclickable for good.
        if (!mask && el.complete && el.naturalWidth) {
          const canvas = document.createElement("canvas");
          canvas.width = el.naturalWidth;
          canvas.height = el.naturalHeight;
          mask = canvas.getContext("2d", { willReadFrequently: true })!;
          mask.drawImage(el, 0, 0);
        }
        if (!mask) return;
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
          x >= mask.canvas.width ||
          y >= mask.canvas.height ||
          mask.getImageData(x, y, 1, 1).data[3] < 50
        )
          return;
      }
      if (el?.dataset.action === "pet") {
        const kind = catClicks.click(performance.now());
        // Mid-frenzy clicks neither count, pet, nor spawn hearts.
        if (kind === "busy" || motion.busy) return;
        if (kind === "frenzy") {
          void startFrenzy();
          return;
        }
        motion.bounce();
        window.dispatchEvent(new CustomEvent("key-pops-pet", { detail: p }));
      }
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
      stopSweep();
      window.clearTimeout(frenzyTimer);
      frenzyRun++;
      motion.reset();
      window.removeEventListener("desktop-click", click);
      window.removeEventListener("reset-input", reset);
      window.removeEventListener("resize", resize);
    };
  }, []);
  const popLayer = useRef<HTMLDivElement>(null);
  const keyPops = useRef<ReturnType<typeof createKeyPopLayer> | null>(null);
  // 键帽飘字固定开启，没有开关。
  useEffect(() => {
    if (!popLayer.current || !scene.current) return;
    const layer = createKeyPopLayer(popLayer.current, scene.current);
    keyPops.current = layer;
    layer.setCovered(covered.current);
    const offInput = window.mengshu.input(layer.input);
    const pet = (e: Event) => {
      const p = (e as CustomEvent<{ x: number; y: number }>).detail;
      layer.pet(p.x, p.y);
    };
    const reset = () => layer.reset();
    const frenzy = () => layer.frenzy();
    window.addEventListener("key-pops-pet", pet);
    window.addEventListener("key-pops-frenzy", frenzy);
    window.addEventListener("reset-input", reset);
    return () => {
      offInput();
      window.removeEventListener("key-pops-pet", pet);
      window.removeEventListener("key-pops-frenzy", frenzy);
      window.removeEventListener("reset-input", reset);
      keyPops.current = null;
      layer.destroy();
    };
  }, []);
  useEffect(() => keyPops.current?.setCovered(s.covered), [s.covered]);
  const layout = sceneLayout(size.w, size.h, s.stage),
    latest = (left: boolean) =>
      [...pressed]
        .reverse()
        .map((c) => keyByCode.get(c))
        .find((k) => k && (left ? k.x < 7.5 : k.x >= 7.5));
  // While frenzied the keyboard is kicked away: paws flail, not type.
  const l = frenzy ? undefined : latest(true),
    r = frenzy ? undefined : latest(false);
  // Side flags refer to the screen. The front-facing cat's right paw is on
  // screen-left (R), and its left paw is on screen-right (main keyboard +/=).
  const restR = keyByCode.get(19)!;
  const restPlus = keyByCode.get(13)!;
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
  const look = panelLook(s.panel, Date.now());
  const panelKey = look ? `${s.panel!.mode}-${s.panel!.index}` : "";
  const stats = useRef<HTMLElement>(null);
  // Animated panel looks advance on a 20fps clock and freeze while covered.
  useEffect(() => {
    if (!look?.motion || !stats.current) return;
    return drivePanelMotion(stats.current, () => covered.current);
  }, [panelKey]);
  // A paw that paused on a key resumes off the shared idle step; realign.
  useEffect(() => {
    if (scene.current) alignIdleMotion(scene.current);
  }, [!!l, !!r, s.covered]);
  return (
    <>
      <div
        ref={scene}
        className={
          "scene" + (frenzy ? " frenzy" : "") + (s.covered ? " covered" : "")
        }
        style={{
          left: layout.x,
          top: layout.y,
          transform: `scale(${layout.k})`,
          // Until main says where the scene goes, it would be centred and
          // oversized in the full-work-area window: keep it hidden.
          visibility: s.stage ? undefined : "hidden",
        }}
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
          <section ref={stats} className="stats" aria-label="今日统计">
            {look ? (
              // Keyed so each new look starts its animations from the top.
              <div
                key={`${s.panel!.mode}-${s.panel!.index}`}
                className={"stats-display fx " + (look.className ?? "")}
                data-panel={`${s.panel!.mode}-${s.panel!.index}`}
              >
                {look.render({
                  keys: s.daily.keys,
                  workMs: s.daily.workMs,
                  continuousMs: s.continuousMs,
                  until: s.panel!.until,
                  now: Date.now(),
                })}
              </div>
            ) : (
              <div className="stats-display" data-panel="normal">
                <div className="metric">
                  <span>敲薯</span>
                  <strong>{s.daily.keys.toLocaleString()} 次</strong>
                </div>
                <div className="metric">
                  <span>今日工作</span>
                  <strong>{duration(s.daily.workMs)}</strong>
                </div>
              </div>
            )}
            {(s.desktopError || s.inputError) && (
              <aside>{s.desktopError || s.inputError}</aside>
            )}
          </section>
          <KeyAnchors pressed={pressed} />
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
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
