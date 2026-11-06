import { useEffect, useRef } from "react";

/** Bars in the "You" tile. */
export const LEVEL_BARS = 5;
const MIN_PX = 6;
const MAX_PX = 34;

/** Maps an RMS level (0..1) to a bar height in px. Louder is taller, with a floor so the bars are always visible. */
export function barHeight(rms: number, index: number): number {
  const shaped = Math.min(1, Math.sqrt(Math.max(0, rms)) * 2.2);
  // Each bar leans a little differently, so the five do not move as one block.
  const lean = 0.65 + 0.35 * Math.abs(Math.sin((index + 1) * 1.7));
  return MIN_PX + (MAX_PX - MIN_PX) * Math.min(1, shaped * lean);
}

/**
 * While `active`, reads the real microphone level from an AnalyserNode on `getStream()` and writes bar heights
 * straight into the given elements. Where the browser has no AudioContext (or no stream), the bars stay at their
 * resting height: nothing is faked.
 */
export function useMicLevel(
  active: boolean,
  getStream: () => MediaStream | null,
  bars: () => (HTMLElement | null)[],
): void {
  const getStreamRef = useRef(getStream);
  const barsRef = useRef(bars);
  useEffect(() => {
    getStreamRef.current = getStream;
    barsRef.current = bars;
  });

  useEffect(() => {
    const rest = () => barsRef.current().forEach((b) => b && (b.style.height = `${MIN_PX}px`));
    const Ctx: typeof AudioContext | undefined =
      typeof window === "undefined" ? undefined : window.AudioContext;
    if (!active || !Ctx) {
      rest();
      return;
    }
    let raf = 0;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    // The stream arrives a moment after the press (permission, getUserMedia): look for it each frame.
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    const samples = new Float32Array(512);
    const frame = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(frame);
      if (!analyser) {
        const stream = getStreamRef.current();
        if (!stream) return;
        try {
          ctx = new Ctx();
          source = ctx.createMediaStreamSource(stream);
          analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
        } catch {
          cancelled = true;
          return;
        }
      }
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      const rms = Math.sqrt(sum / samples.length);
      barsRef.current().forEach((b, i) => b && (b.style.height = `${barHeight(rms, i)}px`));
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      source?.disconnect();
      void ctx?.close().catch(() => {});
      rest();
    };
  }, [active]);
}
