import { ClipBag } from "../shared/clip-bag";

const recordings = Object.values(
  import.meta.glob<string>(["./assets/meows/*.mp3", "./assets/animals/*.mp3"], {
    eager: true,
    query: "?url",
    import: "default",
  }),
);

/** Pause between two clips while the cat keeps yowling in a frenzy. */
const CHAIN_GAP_MS: [number, number] = [60, 220];
/** Fade for the clip still playing when the frenzy ends. */
const CALM_FADE_S = 0.08;

// Shuffle all 40 clips: 30 cats, 1 dog, and 9 animal/novelty surprises.
export function createMeowPlayer() {
  let context: AudioContext | undefined;
  let active: { source: AudioBufferSourceNode; gain: GainNode } | undefined;
  let closed = false;
  const bag = new ClipBag(recordings);
  let idleTimer: number | undefined;
  // Frenzy: keep playing clip after clip (never overlapping) until then.
  let chainUntil = 0;
  let gapTimer: number | undefined;
  const clips = new Map<string, { buffer: AudioBuffer; gain: number }>();
  // A running AudioContext keeps Chromium's audio render thread and the
  // output device awake even in silence; suspend it between meows.
  const suspendSoon = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!active && context?.state === "running") void context.suspend();
    }, 3000);
  };
  const chaining = () => !closed && performance.now() < chainUntil;
  const chainNext = () => {
    window.clearTimeout(gapTimer);
    const [a, b] = CHAIN_GAP_MS;
    gapTimer = window.setTimeout(
      () => {
        if (!chaining()) return suspendSoon();
        // A clip that fails to load is skipped; the next one is tried.
        play().catch((error) => {
          console.warn("猫叫播放失败", error);
          if (chaining()) chainNext();
        });
      },
      a + Math.random() * (b - a),
    );
  };
  async function play() {
    if (closed || active) return;
    context ??= new AudioContext();
    const audio = context;
    window.clearTimeout(idleTimer);
    await audio.resume();
    if (closed || audio.state !== "running" || active) return;
    const url = bag.next();
    let clip = clips.get(url);
    if (!clip) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Cat recording: ${response.status}`);
        const buffer = await audio.decodeAudioData(
          await response.arrayBuffer(),
        );
        // Keep real pitch/timing; only match loudness with a conservative
        // peak cap. Measured once per clip, not on every play.
        let peak = 0;
        let energy = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          for (const value of buffer.getChannelData(channel)) {
            peak = Math.max(peak, Math.abs(value));
            energy += value * value;
          }
        }
        const rms = Math.sqrt(
          energy / (buffer.length * buffer.numberOfChannels),
        );
        clip = {
          buffer,
          gain: Math.min(
            64,
            0.07 / Math.max(rms, 0.0001),
            0.6 / Math.max(peak, 0.001),
          ),
        };
        clips.set(url, clip);
      } catch (error) {
        suspendSoon();
        throw error;
      }
    }
    if (closed || active) return;
    const source = audio.createBufferSource();
    source.buffer = clip.buffer;
    const gain = audio.createGain();
    gain.gain.value = clip.gain;
    source.connect(gain);
    gain.connect(audio.destination);
    const playing = { source, gain };
    active = playing;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (active === playing) active = undefined;
      if (chaining()) chainNext();
      else suspendSoon();
    };
    source.start();
  }
  return {
    play,
    /** Yowl clip after clip, each a different sound, for `ms`. */
    frenzy(ms: number) {
      chainUntil = performance.now() + ms;
      if (!active)
        play().catch((error) => {
          console.warn("猫叫播放失败", error);
          if (chaining()) chainNext();
        });
    },
    /** The frenzy is over: stop chaining and fade out the clip in progress. */
    calm() {
      chainUntil = 0;
      window.clearTimeout(gapTimer);
      if (active && context) {
        const now = context.currentTime;
        active.gain.gain.setTargetAtTime(0, now, CALM_FADE_S / 3);
        try {
          active.source.stop(now + CALM_FADE_S);
        } catch {}
      }
    },
    close() {
      closed = true;
      chainUntil = 0;
      window.clearTimeout(idleTimer);
      window.clearTimeout(gapTimer);
      try {
        active?.source.stop();
      } catch {}
      active = undefined;
      clips.clear();
      void context?.close();
      context = undefined;
    },
  };
}
