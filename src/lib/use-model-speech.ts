import { useCallback, useEffect, useRef } from "react";
import { localeForCourse, type Course } from "@/data/course-meta";
import { authHeaders } from "./auth-headers";
import { canSpeak, speak } from "./speech";
import { voiceFor } from "./voice-prefs";

/**
 * Plays a model pronunciation: the existing /api/tts voice (the learner's chosen Alphonso voice), and the device
 * voice when that is unavailable, so a miss always teaches something audible when the device can speak at all.
 */
export function useModelSpeech(course: Course) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audioRef.current?.pause(), []);
  return useCallback(
    async (text: string) => {
      audioRef.current?.pause();
      try {
        const voice = await voiceFor("alphonso", course);
        const resp = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ text, course, voice }),
        });
        if (!resp.ok) throw new Error("tts");
        const url = URL.createObjectURL(await resp.blob());
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
      } catch {
        if (canSpeak()) speak(text, localeForCourse(course));
      }
    },
    [course],
  );
}
