const recordings = Object.values(
  import.meta.glob<string>(["./assets/meows/*.mp3", "./assets/animals/*.mp3"], {
    eager: true,
    query: "?url",
    import: "default",
  }),
);

// Shuffle all 40 clips: 30 cats, 1 dog, and 9 animal/novelty surprises.
export function createMeowPlayer() {
  let context: AudioContext | undefined;
  let active: AudioBufferSourceNode | undefined;
  let closed = false;
  let last = "";
  let bag: string[] = [];
  let idleTimer: number | undefined;
  const clips = new Map<string, { buffer: AudioBuffer; gain: number }>();
  // A running AudioContext keeps Chromium's audio render thread and the
  // output device awake even in silence; suspend it between meows.
  const suspendSoon = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!active && context?.state === "running") void context.suspend();
    }, 3000);
  };
  return {
    async play() {
      if (closed || active) return;
      context ??= new AudioContext();
      const audio = context;
      window.clearTimeout(idleTimer);
      await audio.resume();
      if (closed || audio.state !== "running" || active) return;
      if (!bag.length) {
        bag = [...recordings];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        if (bag.length > 1 && bag[bag.length - 1] === last)
          [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
      const url = bag.pop()!;
      let clip = clips.get(url);
      if (!clip) {
        try {
          const response = await fetch(url);
          if (!response.ok)
            throw new Error(`Cat recording: ${response.status}`);
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
      last = url;
      const source = audio.createBufferSource();
      source.buffer = clip.buffer;
      const gain = audio.createGain();
      gain.gain.value = clip.gain;
      source.connect(gain);
      gain.connect(audio.destination);
      active = source;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (active === source) active = undefined;
        suspendSoon();
      };
      source.start();
    },
    close() {
      closed = true;
      window.clearTimeout(idleTimer);
      active?.stop();
      active = undefined;
      clips.clear();
      void context?.close();
      context = undefined;
    },
  };
}
