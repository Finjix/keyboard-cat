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
  const buffers = new Map<string, AudioBuffer>();
  return {
    async play() {
      if (closed || active) return;
      context ??= new AudioContext();
      const audio = context;
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
      let buffer = buffers.get(url);
      if (!buffer) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Cat recording: ${response.status}`);
        buffer = await audio.decodeAudioData(await response.arrayBuffer());
        buffers.set(url, buffer);
      }
      if (closed || active) return;
      last = url;
      const source = audio.createBufferSource();
      source.buffer = buffer;
      // Keep real pitch/timing; only match loudness with a conservative peak cap.
      let peak = 0;
      let energy = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        for (const value of buffer.getChannelData(channel)) {
          peak = Math.max(peak, Math.abs(value));
          energy += value * value;
        }
      }
      const rms = Math.sqrt(energy / (buffer.length * buffer.numberOfChannels));
      const gain = audio.createGain();
      gain.gain.value = Math.min(
        64,
        0.07 / Math.max(rms, 0.0001),
        0.6 / Math.max(peak, 0.001),
      );
      source.connect(gain);
      gain.connect(audio.destination);
      active = source;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (active === source) active = undefined;
      };
      source.start();
    },
    close() {
      closed = true;
      active?.stop();
      active = undefined;
      buffers.clear();
      void context?.close();
      context = undefined;
    },
  };
}
