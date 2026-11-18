import { useCallback, useEffect, useRef, useState } from "react";
import type { Course } from "@/data/courses";
import { authHeaders } from "./auth-headers";
import { nextSegment } from "./stories";
import { voiceFor } from "./voice-prefs";

export type NarrationState = {
  /** The segment being read aloud (highlighted), or null when nothing is playing. */
  current: number | null;
  playing: boolean;
  /** True after the narration voice could not be reached; the text stays readable. */
  failed: boolean;
};

/**
 * Narrates a story one segment at a time through the existing /api/tts voice (the learner's chosen Alphonso voice),
 * handing the highlight from segment to segment as each one ends. The next segment is fetched while the current one
 * plays, so the gap between sentences is short. Sentence-level highlighting is v1; word-level needs timings.
 */
export function useStoryNarration(
  segments: string[],
  course: string,
  onSegment?: (index: number) => void,
) {
  const [state, setState] = useState<NarrationState>({
    current: null,
    playing: false,
    failed: false,
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runRef = useRef(0);
  const cacheRef = useRef(new Map<number, Promise<string>>());
  const onSegmentRef = useRef(onSegment);
  onSegmentRef.current = onSegment;

  const fetchUrl = useCallback(
    (index: number): Promise<string> => {
      const cached = cacheRef.current.get(index);
      if (cached) return cached;
      const p = (async () => {
        // A voice-preference lookup that fails must not silence the story: the server then uses the default voice.
        const voice = await voiceFor("alphonso", course as Course).catch(() => undefined);
        const resp = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ text: segments[index], course, voice }),
        });
        if (!resp.ok) throw new Error("tts");
        return URL.createObjectURL(await resp.blob());
      })();
      // A failed fetch is not kept, so a later play tries again.
      p.catch(() => cacheRef.current.delete(index));
      cacheRef.current.set(index, p);
      return p;
    },
    [segments, course],
  );

  const stop = useCallback(() => {
    runRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setState((s) => ({ ...s, current: null, playing: false }));
  }, []);

  const play = useCallback(
    async (from = 0) => {
      audioRef.current?.pause();
      const run = ++runRef.current;
      let index: number | null = from;
      setState({ current: from, playing: true, failed: false });
      while (index !== null) {
        if (run !== runRef.current) return;
        setState({ current: index, playing: true, failed: false });
        onSegmentRef.current?.(index);
        const ahead = nextSegment(index, segments.length);
        try {
          const url = await fetchUrl(index);
          if (run !== runRef.current) return;
          if (ahead !== null) void fetchUrl(ahead).catch(() => undefined);
          const audio = new Audio(url);
          audioRef.current = audio;
          await new Promise<void>((resolve, reject) => {
            audio.onended = () => resolve();
            audio.onerror = () => reject(new Error("audio"));
            audio.play().catch(reject);
          });
        } catch {
          if (run === runRef.current) setState({ current: null, playing: false, failed: true });
          return;
        }
        index = ahead;
      }
      if (run === runRef.current) setState({ current: null, playing: false, failed: false });
    },
    [segments, fetchUrl],
  );

  useEffect(
    () => () => {
      runRef.current += 1;
      audioRef.current?.pause();
      for (const p of cacheRef.current.values())
        void p.then(
          (u) => URL.revokeObjectURL(u),
          () => undefined,
        );
    },
    [],
  );

  return { ...state, play, stop };
}
