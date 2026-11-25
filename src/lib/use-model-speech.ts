import { useCallback, useEffect, useRef } from "react";
import { track } from "./analytics";
import { voicePlayback } from "./voice-playback";
import { localeForCourse, type Course } from "@/data/course-meta";
import { authHeaders } from "./auth-headers";
import { canSpeak, speak } from "./speech";
import { voiceFor } from "./voice-prefs";

/** The existing /api/tts voice (the learner's chosen Alphonso voice) for `text`, as an audio blob. Throws on failure. */
export async function fetchModelSpeech(text: string, course: Course): Promise<Blob> {
  const voice = await voiceFor("alphonso", course);
  const resp = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text, course, voice }),
  });
  if (!resp.ok) throw new Error("tts");
  return resp.blob();
}

/**
 * Plays a model pronunciation: the existing /api/tts voice (the learner's chosen Alphonso voice) on the app's one
 * persistent audio element, and the device voice when that is unavailable or the browser refuses to play it, so a miss
 * always teaches something audible when the device can speak at all. It returns once the clip has started loading, not
 * when it ends.
 */
export function useModelSpeech(course: Course) {
  const run = useRef(0);
  useEffect(
    () => () => {
      // Leaving the screen stops its voice.
      run.current += 1;
      voicePlayback().stop();
    },
    [],
  );
  return useCallback(
    async (text: string) => {
      const playback = voicePlayback();
      const mine = ++run.current;
      playback.stop();
      // Inside the tap that asked for it, so the element may play after the fetch below.
      playback.unlock();
      const device = () => {
        if (mine === run.current && canSpeak()) speak(text, localeForCourse(course));
      };
      try {
        const blob = await fetchModelSpeech(text, course);
        if (mine !== run.current) return;
        void playback.play(blob).then((outcome) => {
          if (outcome.result !== "blocked" && outcome.result !== "error") return;
          void track("voice_playback_failed", {
            surface: "model_speech",
            reason: outcome.result === "blocked" ? "play_blocked" : "play_error",
            error_kind: outcome.errorName,
          });
          device();
        });
      } catch {
        device();
      }
    },
    [course],
  );
}
