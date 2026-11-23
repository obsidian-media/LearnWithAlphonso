import { useCallback, useEffect, useRef, useState } from "react";
import { localeForCourse, type Course } from "@/data/course-meta";
import { fetchModelSpeech } from "./use-model-speech";
import { canSpeak, speak } from "./speech";
import { claimAudioSession } from "./audio-session";
import { voicePlayback } from "./voice-playback";
import { WAVE_BARS, decodeBlobSamples, waveformPeaks, type SampleDecoder } from "./waveform";

/** "Say it slower": the model replays at this fraction of normal speed, client side (no second /api/tts call). */
export const SLOW_RATE = 0.75;

export type ClipKind = "you" | "model";

/** What is playing now: which clip, and whether the model is the slowed version. */
export type NowPlaying = { kind: ClipKind; slow: boolean } | null;

type ModelClip = { text: string; url: string };
type Active = { audio: HTMLAudioElement; raf: number | null };

/**
 * The audio behind Say it right's "Hear you vs Alphonso": the learner's last attempt and Alphonso's model, kept IN
 * MEMORY ONLY (blobs and object URLs held in refs, never uploaded or stored) and freed whenever `resetKey` changes
 * (the word moved on) and on unmount. One clip plays at a time: starting one stops the other and calls `onPlayStart`
 * (the screen cancels any recording). The model's audio is fetched at most once per word and reused for Hear it, Say
 * it slower and its waveform.
 */
export function useSayItRightAudio({
  course,
  resetKey,
  decode = decodeBlobSamples,
  fetchModel = fetchModelSpeech,
  // The app's one persistent element (see voice-playback.ts), so a tap's unlock covers the clip that plays after a fetch.
  createAudio = (src: string) => {
    const playback = voicePlayback();
    playback.stop();
    claimAudioSession("voice");
    const el = playback.element() ?? new Audio();
    el.src = src;
    return el;
  },
  onPlayStart,
}: {
  course: Course;
  /** A new value (the next word) frees every clip. */
  resetKey: string;
  decode?: SampleDecoder;
  fetchModel?: (text: string, course: Course) => Promise<Blob>;
  createAudio?: (src: string) => HTMLAudioElement;
  onPlayStart?: () => void;
}) {
  const [playing, setPlaying] = useState<NowPlaying>(null);
  const [progress, setProgress] = useState(0);
  const [hasYou, setHasYou] = useState(false);
  const [youPeaks, setYouPeaks] = useState<number[] | null>(null);
  const [modelPeaks, setModelPeaks] = useState<number[] | null>(null);

  const gen = useRef(0);
  const token = useRef(0);
  const you = useRef<{ blob: Blob; url: string | null } | null>(null);
  const model = useRef<ModelClip | null>(null);
  const inflight = useRef<{ text: string; promise: Promise<ModelClip> } | null>(null);
  const active = useRef<Active | null>(null);
  // True only while device speech THIS screen started may still be going: stop() cancels the speech synthesiser only then.
  const deviceSpoke = useRef(false);
  const playingRef = useRef<NowPlaying>(null);
  playingRef.current = playing;
  const opts = useRef({ decode, fetchModel, createAudio, onPlayStart, course });
  opts.current = { decode, fetchModel, createAudio, onPlayStart, course };

  const stop = useCallback(() => {
    token.current += 1;
    const a = active.current;
    active.current = null;
    if (a) {
      if (a.raf !== null) cancelAnimationFrame(a.raf);
      a.audio.onended = null;
      a.audio.pause();
      // Let go of the clip itself, not just the playback.
      a.audio.src = "";
    }
    if (deviceSpoke.current && canSpeak()) window.speechSynthesis.cancel();
    deviceSpoke.current = false;
    setPlaying(null);
    setProgress(0);
  }, []);

  const release = useCallback(() => {
    stop();
    gen.current += 1;
    if (you.current?.url) URL.revokeObjectURL(you.current.url);
    if (model.current) URL.revokeObjectURL(model.current.url);
    you.current = null;
    model.current = null;
    inflight.current = null;
    setHasYou(false);
    setYouPeaks(null);
    setModelPeaks(null);
  }, [stop]);

  // Free everything when the word changes and when the screen closes.
  useEffect(() => () => release(), [resetKey, release]);

  const peaksOf = (blob: Blob, set: (p: number[] | null) => void) => {
    const g = gen.current;
    opts.current
      .decode(blob)
      .then((s) => {
        if (g === gen.current) set(waveformPeaks(s, WAVE_BARS));
      })
      // A clip that will not decode keeps its flat placeholder row; playing it still works.
      .catch(() => {
        if (g === gen.current) set(null);
      });
  };

  /** Keeps the learner's latest attempt (replacing the last one). Never leaves this tab. */
  const setYouClip = useCallback(
    (blob: Blob) => {
      if (playingRef.current?.kind === "you") stop();
      if (you.current?.url) URL.revokeObjectURL(you.current.url);
      you.current = { blob, url: null };
      setHasYou(true);
      setYouPeaks(null);
      peaksOf(blob, setYouPeaks);
    },
    [stop],
  );

  const ensureModel = (text: string): Promise<ModelClip> => {
    if (model.current?.text === text) return Promise.resolve(model.current);
    if (inflight.current?.text === text) return inflight.current.promise;
    const g = gen.current;
    const promise = opts.current.fetchModel(text, opts.current.course).then((blob) => {
      if (g !== gen.current) throw new Error("stale");
      const clip = { text, url: URL.createObjectURL(blob) };
      model.current = clip;
      peaksOf(blob, setModelPeaks);
      return clip;
    });
    const entry = { text, promise };
    inflight.current = entry;
    const clear = () => {
      if (inflight.current === entry) inflight.current = null;
    };
    promise.then(clear, clear);
    return promise;
  };

  const start = async (kind: ClipKind, src: string, slow: boolean) => {
    const audio = opts.current.createAudio(src);
    audio.playbackRate = slow ? SLOW_RATE : 1;
    // Slower must not make Alphonso sound lower: keep the pitch where it was.
    (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    const entry: Active = { audio, raf: null };
    active.current = entry;
    const settle = () => {
      if (active.current === entry) stop();
    };
    // Every way a clip can end settles the buttons: the end, a pause (a locked screen, a call) and an error.
    audio.onended = settle;
    audio.onpause = settle;
    audio.onerror = settle;
    const tick = () => {
      if (active.current !== entry) return;
      const d = audio.duration;
      setProgress(d && Number.isFinite(d) ? Math.min(1, audio.currentTime / d) : 0);
      entry.raf = requestAnimationFrame(tick);
    };
    setPlaying({ kind, slow });
    setProgress(0);
    try {
      await audio.play();
      if (active.current === entry) entry.raf = requestAnimationFrame(tick);
    } catch {
      if (active.current === entry) stop();
    }
  };

  /** Plays Alphonso's model (fetched once per word), at normal speed or slowed. */
  const playModel = useCallback(async (text: string, slow = false) => {
    stop();
    opts.current.onPlayStart?.();
    // Inside the tap: the persistent element may then play the model after its fetch.
    voicePlayback().unlock();
    const mine = token.current;
    try {
      const clip = await ensureModel(text);
      if (mine !== token.current) return;
      await start("model", clip.url, slow);
    } catch {
      // No TTS (offline, over quota): the device voice, so a miss still teaches something audible.
      if (mine === token.current && canSpeak()) {
        deviceSpoke.current = true;
        speak(text, localeForCourse(opts.current.course), slow ? SLOW_RATE : 1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playYou = useCallback(async () => {
    const clip = you.current;
    if (!clip) return;
    stop();
    opts.current.onPlayStart?.();
    voicePlayback().unlock();
    if (!clip.url) clip.url = URL.createObjectURL(clip.blob);
    await start("you", clip.url, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Tap the learner's waveform: plays their clip, or stops it when it is the one already playing. */
  const toggleYou = useCallback(() => {
    if (playingRef.current?.kind === "you") stop();
    else void playYou();
  }, [playYou, stop]);

  /** Tap Alphonso's waveform (or Say it slower, with `slow`): plays the model, or stops that very playback. */
  const toggleModel = useCallback(
    (text: string, slow = false) => {
      const p = playingRef.current;
      if (p?.kind === "model" && p.slow === slow) stop();
      else void playModel(text, slow);
    },
    [playModel, stop],
  );

  return {
    playing,
    progress,
    hasYou,
    youPeaks,
    modelPeaks,
    setYouClip,
    playModel,
    toggleYou,
    toggleModel,
    stop,
  };
}
