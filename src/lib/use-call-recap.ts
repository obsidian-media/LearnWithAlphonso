import { useCallback, useEffect, useRef, useState } from "react";
import type { Course } from "../data/courses";
import { authHeaders } from "./auth-headers";
import {
  addRecapToReview,
  callQualifiesForRecap,
  fetchCallRecap,
  type RecapView,
  type Transcript,
} from "./call-recap-api";
import { voiceFor } from "./voice-prefs";

/**
 * The result screen's recap. It starts when the result appears and never holds the screen up: while it is pending the
 * screen shows a quiet placeholder, and when it is over (done, empty, failed, offline, timed out) the slip block takes
 * the slot. A call too short for a recap is "off" from the first render.
 */
export type RecapController = {
  status: "off" | "pending" | "ready";
  recap: RecapView | null;
  review: "idle" | "adding" | "added" | "failed";
  onReview: () => void;
  /** The phrase being spoken, if any. */
  speaking: string | null;
  onSpeak: (text: string) => void;
};

export function useCallRecap(args: {
  /** null until the call has a result. */
  callId: string | null;
  messages: Transcript;
  course: Course;
  cefrLevel?: string;
  scene?: string;
}): RecapController {
  const { callId, course } = args;
  const qualifies = callId !== null && callQualifiesForRecap(args.messages);
  const [state, setState] = useState<{ done: boolean; recap: RecapView | null }>({
    done: false,
    recap: null,
  });
  const [review, setReview] = useState<RecapController["review"]>("idle");
  const [speaking, setSpeaking] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    if (!qualifies || !callId) return;
    let live = true;
    setState({ done: false, recap: null });
    setReview("idle");
    const a = argsRef.current;
    void fetchCallRecap({
      callId,
      messages: a.messages,
      cefrLevel: a.cefrLevel,
      scene: a.scene,
    }).then((recap) => live && setState({ done: true, recap }));
    return () => {
      live = false;
    };
  }, [qualifies, callId]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const onReview = useCallback(() => {
    const token = state.recap?.reviewToken;
    if (!token || !callId || review === "adding" || review === "added") return;
    setReview("adding");
    void addRecapToReview(callId, token).then((ok) => setReview(ok ? "added" : "failed"));
  }, [state.recap, callId, review]);

  const onSpeak = useCallback(
    (text: string) => {
      void (async () => {
        audioRef.current?.pause();
        setSpeaking(text);
        try {
          const voice = await voiceFor("alphonso", course);
          const resp = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await authHeaders()) },
            body: JSON.stringify({ text, course, voice }),
          });
          if (!resp.ok) return setSpeaking(null);
          const url = URL.createObjectURL(await resp.blob());
          const audio = new Audio(url);
          audioRef.current = audio;
          const stop = () => {
            if (audioRef.current === audio) setSpeaking(null);
          };
          audio.onended = () => {
            URL.revokeObjectURL(url);
            stop();
          };
          audio.onpause = stop;
          audio.onerror = stop;
          await audio.play();
        } catch {
          setSpeaking(null);
        }
      })();
    },
    [course],
  );

  const status = !qualifies ? "off" : !state.done ? "pending" : state.recap ? "ready" : "off";
  return { status, recap: state.recap, review, onReview, speaking, onSpeak };
}
