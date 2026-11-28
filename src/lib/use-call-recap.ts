import { useCallback, useEffect, useRef, useState } from "react";
import type { Course } from "../data/courses";
import { authHeaders } from "./auth-headers";
import {
  addRecapToReview,
  callQualifiesForRecap,
  fetchCallRecapAttempt,
  type RecapView,
  type Transcript,
} from "./call-recap-api";
import type { RehearsalSpeaking } from "./rehearsal-speaking";
import { voiceFor } from "./voice-prefs";
import { track } from "./analytics";
import { canSpeak, speak } from "./speech";
import { localeForCourse } from "../data/course-meta";
import { voicePlayback } from "./voice-playback";

/**
 * The result screen's recap. It starts when the result appears and never holds the screen up: while it is pending the
 * screen shows a quiet placeholder, and when it is over (done, empty, failed, offline, timed out) the slip block takes
 * the slot. A call too short for a recap is "off" from the first render.
 */
export type RecapController = {
  /** "failed": the attempt did not work and the call is not used up, so "Try again" is offered. */
  status: "off" | "pending" | "ready" | "failed";
  recap: RecapView | null;
  /** "How you spoke" for a rehearsal run (counts only), when the server sent it. */
  howYouSpoke: RehearsalSpeaking | null;
  review: "idle" | "adding" | "added" | "failed";
  onRetry: () => void;
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
  const [state, setState] = useState<{
    done: boolean;
    recap: RecapView | null;
    retry: boolean;
    speaking: RehearsalSpeaking | null;
  }>({ done: false, recap: null, retry: false, speaking: null });
  const [attempt, setAttempt] = useState(0);
  const [review, setReview] = useState<RecapController["review"]>("idle");
  const [speaking, setSpeaking] = useState<string | null>(null);
  const speakRun = useRef(0);
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    if (!qualifies || !callId) return;
    let live = true;
    setState({ done: false, recap: null, retry: false, speaking: null });
    setReview("idle");
    const a = argsRef.current;
    void fetchCallRecapAttempt({
      callId,
      messages: a.messages,
      cefrLevel: a.cefrLevel,
      scene: a.scene,
    }).then(
      (r) => live && setState({ done: true, recap: r.recap, retry: r.retry, speaking: r.speaking }),
    );
    return () => {
      live = false;
    };
  }, [qualifies, callId, attempt]);

  const onRetry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(
    () => () => {
      speakRun.current += 1;
      voicePlayback().stop();
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
        const playback = voicePlayback();
        const mine = ++speakRun.current;
        playback.stop();
        // Inside the tap, so the persistent element may play after the fetch below.
        playback.unlock();
        setSpeaking(text);
        const finish = () => {
          if (mine === speakRun.current) setSpeaking(null);
        };
        const device = () => {
          if (mine !== speakRun.current || !canSpeak()) return;
          speak(text, localeForCourse(course));
        };
        try {
          const voice = await voiceFor("alphonso", course);
          const resp = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await authHeaders()) },
            body: JSON.stringify({ text, course, voice }),
          });
          if (!resp.ok) return finish();
          const clip = await resp.blob();
          if (mine !== speakRun.current) return;
          const outcome = await playback.play(clip);
          if (outcome.result === "blocked" || outcome.result === "error") {
            void track("voice_playback_failed", {
              surface: "call_recap",
              reason: outcome.result === "blocked" ? "play_blocked" : "play_error",
              error_kind: outcome.errorName,
            });
            device();
          }
          finish();
        } catch {
          finish();
        }
      })();
    },
    [course],
  );

  const status = !qualifies
    ? "off"
    : !state.done
      ? "pending"
      : state.recap
        ? "ready"
        : state.retry
          ? "failed"
          : "off";
  return {
    status,
    recap: state.recap,
    howYouSpoke: state.speaking,
    review,
    onRetry,
    onReview,
    speaking,
    onSpeak,
  };
}
