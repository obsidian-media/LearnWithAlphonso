import { useCallback, useEffect, useRef, useState } from "react";
import type { Course } from "@/data/courses";
import { authHeaders } from "./auth-headers";
import { nextSegment } from "./stories";
import { fetchStoryRecordings, recordingPathFor, storyAudioPublicUrl } from "./story-recordings";
import { voiceFor } from "./voice-prefs";

export type NarrationState = {
  /** The segment being read aloud (highlighted), or null when nothing is playing. */
  current: number | null;
  playing: boolean;
  /** True after the narration voice could not be reached; the text stays readable. */
  failed: boolean;
};

/**
 * Narrates a story one segment at a time, handing the highlight from segment to segment as each one ends. A sentence
 * that has a pre-recorded file (src/lib/story-recordings.ts, made by scripts/story-audio.ts) just plays it: no
 * /api/tts call, no AI quota, no AI consent. Only a sentence with no recording (or whose file will not play) falls
 * back to the live /api/tts voice (the learner's chosen Alphonso voice), which keeps today's consent and quota. The next
 * segment is fetched while the current one plays, so the gap between sentences is short. Sentence-level highlighting
 * is v1; word-level needs timings.
 *
 * `storyId` names the story whose recordings to look up (a branching story passes its own id for every node);
 * without it nothing is looked up and every sentence is live speech.
 */
export function useStoryNarration(
  segments: string[],
  course: string,
  onSegment?: (index: number) => void,
  storyId?: string,
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

  const recordingsRef = useRef<ReturnType<typeof fetchStoryRecordings> | null>(null);
  const recordedRef = useRef(new Set<number>());

  const fetchUrl = useCallback(
    (index: number, live = false): Promise<string> => {
      const cached = live ? undefined : cacheRef.current.get(index);
      if (cached) return cached;
      const p = (async () => {
        if (!live) {
          // The recording first: a plain public file, nothing to authorise or pay for.
          recordingsRef.current ??= fetchStoryRecordings(
            import.meta.env.VITE_SUPABASE_URL as string | undefined,
            storyId,
          );
          const loaded = await recordingsRef.current;
          // A failed load (offline, no manifest yet) is not kept, so a later play looks again.
          if (!loaded) recordingsRef.current = null;
          const path = recordingPathFor(loaded, segments[index]);
          if (path) {
            recordedRef.current.add(index);
            return storyAudioPublicUrl(import.meta.env.VITE_SUPABASE_URL as string, path);
          }
        }
        recordedRef.current.delete(index);
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
    [segments, course, storyId],
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
          const playUrl = (src: string) =>
            new Promise<void>((resolve, reject) => {
              const audio = new Audio(src);
              audioRef.current = audio;
              audio.onended = () => resolve();
              audio.onerror = () => reject(new Error("audio"));
              audio.play().catch(reject);
            });
          try {
            await playUrl(url);
          } catch (err) {
            // A recording that will not play (file missing or unreadable) falls back to live speech for this sentence.
            if (!recordedRef.current.has(index) || run !== runRef.current) throw err;
            cacheRef.current.delete(index);
            await playUrl(await fetchUrl(index, true));
          }
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
          (u) => {
            if (u.startsWith("blob:")) URL.revokeObjectURL(u);
          },
          () => undefined,
        );
    },
    [],
  );

  return { ...state, play, stop };
}
