import { useCallback, useEffect, useRef, useState } from "react";
import type { PhaseKind } from "./avatar/machine";
import {
  HandsFreeLoop,
  type HandsFreeEffect,
  type HandsFreeEvent,
  type HandsFreeStatus,
  type HandsFreeTuning,
} from "./hands-free-loop";
import { useSpeechCapture } from "./use-speech-capture";
import type { HandsFreeCall } from "@/components/HandsFreeSwitch";
import type { Course } from "@/data/courses";

/** How often the microphone level is read while a hands-free turn is recording (iOS: every 100 ms). */
export const LEVEL_SAMPLE_MS = 100;

/** Hands-free needs an AudioContext to read the level. Where a browser has none, the switch is not offered. */
export function handsFreeSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
  return typeof (w.AudioContext ?? w.webkitAudioContext) === "function";
}

function audioContextClass(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

/** An RMS amplitude (0..1) as dBFS; silence reads -160, like the iOS recorder before any audio. */
export function rmsToDBFS(rms: number): number {
  return rms > 1e-8 ? 20 * Math.log10(rms) : -160;
}

type Controls = {
  /** Asks the capture for a new recording (the same as a press). */
  begin: () => void;
  /** Ends the recording and sends it (the same as a release). */
  end: () => void;
  /** Throws the recording away. */
  cancel: () => void;
};

/**
 * Runs the pure `HandsFreeLoop` against a real call: feeds it the voice phase, the microphone level and the learner's
 * taps, and performs its effects. The switch (`wanted`) is the learner's; `live` is whether the call is on screen
 * (a campaign result between scenes is not), so the mic closes there and re-arms on the next scene.
 */
export function useHandsFree({
  wanted,
  live,
  tuning,
  phase,
  failure,
  getStream,
  controls,
}: {
  wanted: boolean;
  live: boolean;
  tuning: HandsFreeTuning;
  /** The call's full voice phase, so the mic opens only after the reply has finished playing (half-duplex). */
  phase: PhaseKind;
  /** The call's last error text, if any: a new one pauses hands-free. */
  failure: string | null;
  getStream: () => MediaStream | null;
  controls: Controls;
}) {
  const loopRef = useRef<HandsFreeLoop | null>(null);
  if (!loopRef.current) loopRef.current = new HandsFreeLoop(tuning);
  const [status, setStatus] = useState<HandsFreeStatus>(loopRef.current.status);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const getStreamRef = useRef(getStream);
  getStreamRef.current = getStream;

  const dispatch = useCallback((event: HandsFreeEvent) => {
    const loop = loopRef.current!;
    const effects: HandsFreeEffect[] = loop.handle(event);
    setStatus(loop.status);
    for (const effect of effects) {
      if (effect === "beginTurn") controlsRef.current.begin();
      else if (effect === "endTurn") controlsRef.current.end();
      else controlsRef.current.cancel();
    }
  }, []);

  // A new error (a failed reply, a refused mic) pauses. Declared before the phase effect, so in one commit the
  // pause lands before the "idle" that follows the failed turn can start another.
  useEffect(() => {
    if (failure && loopRef.current!.isOn) dispatch({ type: "voicePhase", phase: "failed" });
  }, [failure, dispatch]);

  // The voice phase, always (also while off), so switching on mid-reply waits for the reply to end.
  useEffect(() => {
    dispatch({ type: "voicePhase", phase });
  }, [phase, dispatch]);

  const enabled = wanted && live;
  useEffect(() => {
    dispatch({ type: enabled ? "enable" : "disable" });
  }, [enabled, dispatch]);

  // Leaving the call (or the page) closes an open mic and sends nothing.
  useEffect(
    () => () => {
      const loop = loopRef.current!;
      if (loop.isOn) loop.handle({ type: "disable" });
      controlsRef.current.cancel();
    },
    [],
  );

  // The microphone level, while a hands-free turn records.
  const sampling =
    phase === "recording" && (status.kind === "listening" || status.kind === "hearing");
  useEffect(() => {
    if (!sampling) return;
    const Ctx = audioContextClass();
    if (!Ctx) return;
    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let samples: Float32Array<ArrayBuffer> | null = null;
    let watched: MediaStream | null = null;
    const onTrackEnded = () => dispatch({ type: "audioInterrupted" });
    const id = setInterval(() => {
      if (!analyser) {
        const stream = getStreamRef.current();
        if (!stream) return;
        try {
          ctx = new Ctx();
          void ctx.resume?.();
          source = ctx.createMediaStreamSource(stream);
          analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser);
          samples = new Float32Array(analyser.fftSize);
          watched = stream;
          // The microphone went away (unplugged, permission revoked): nothing may keep listening.
          watched.getAudioTracks?.().forEach((t) => t.addEventListener?.("ended", onTrackEnded));
        } catch {
          dispatch({ type: "voicePhase", phase: "failed" });
          return;
        }
      }
      analyser.getFloatTimeDomainData(samples!);
      let sum = 0;
      for (const v of samples!) sum += v * v;
      dispatch({
        type: "level",
        dBFS: rmsToDBFS(Math.sqrt(sum / samples!.length)),
        at: performance.now() / 1000,
      });
    }, LEVEL_SAMPLE_MS);
    return () => {
      clearInterval(id);
      watched?.getAudioTracks?.().forEach((t) => t.removeEventListener?.("ended", onTrackEnded));
      source?.disconnect();
      void ctx?.close().catch(() => {});
    };
  }, [sampling, dispatch]);

  // A hidden tab is not a place to keep listening: pause, and drop an open recording.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return;
      if (!loopRef.current!.isOn) return;
      dispatch({ type: "audioInterrupted" });
      if (phaseRef.current === "recording") controlsRef.current.cancel();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [dispatch]);

  const togglePause = useCallback(() => dispatch({ type: "togglePause" }), [dispatch]);
  const noWords = useCallback(() => dispatch({ type: "turnHadNoWords" }), [dispatch]);
  const failed = useCallback(() => dispatch({ type: "voicePhase", phase: "failed" }), [dispatch]);

  return { status, togglePause, noWords, failed };
}

/**
 * Speech capture plus hands-free for one call. `replyPhase` is what the call is doing after the learner's words are
 * in: "idle", "thinking" (the reply is being made) or "speaking" (its audio plays). The phase the loop sees is built
 * here, in one place for Hector and both Practice screens.
 */
export function useHandsFreeCapture({
  course,
  onTranscript,
  wanted,
  live,
  tuning,
  replyPhase,
  failure,
  onBeginTurn,
  partner,
  onWantedChange,
}: {
  course?: Course;
  onTranscript: (text: string, confidence: number | null) => void | Promise<void>;
  wanted: boolean;
  live: boolean;
  tuning: HandsFreeTuning;
  replyPhase: "idle" | "thinking" | "speaking";
  failure: string | null;
  /** Runs before each hands-free turn opens the mic (the call clears its stale error here). */
  onBeginTurn?: () => void;
  /** Who is on the call ("Alphonso" or "Hector"): the first-use note names them. */
  partner: string;
  /** The switch was changed. The call keeps the state (so a campaign carries it from scene to scene). */
  onWantedChange: (on: boolean) => void;
}) {
  const on = wanted && live;
  // Read after mount, so the server and the first client render agree (no switch), then the browser decides.
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(handsFreeSupported()), []);
  const reportRef = useRef<{ noWords: () => void; failed: () => void } | null>(null);
  const capture = useSpeechCapture({
    course,
    onTranscript,
    handsFree: on,
    onNoWords: () => reportRef.current?.noWords(),
    onFailure: () => reportRef.current?.failed(),
  });
  const phase: PhaseKind = capture.starting
    ? "requestingPermission"
    : capture.state === "recording"
      ? "recording"
      : capture.state === "transcribing"
        ? "transcribing"
        : replyPhase === "idle"
          ? "idle"
          : replyPhase;
  const { start, stop, cancel } = capture;
  const handsFree = useHandsFree({
    wanted,
    live,
    tuning,
    phase,
    failure,
    getStream: capture.getStream,
    controls: {
      begin: () => {
        onBeginTurn?.();
        void start();
      },
      end: stop,
      cancel,
    },
  });
  reportRef.current = handsFree;
  const handsFreeCall: HandsFreeCall | undefined = supported
    ? {
        on: wanted,
        onChange: onWantedChange,
        status: handsFree.status,
        onTogglePause: handsFree.togglePause,
        partner,
      }
    : undefined;
  return { ...capture, phase, handsFree, handsFreeCall };
}
