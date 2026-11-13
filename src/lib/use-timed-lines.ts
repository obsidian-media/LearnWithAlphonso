import { useEffect, useState } from "react";
import { timedLinesFor, type TimedLine, type TimingEntry } from "./podcast-timings";

/**
 * The episode's timed transcript lines, or null (plain transcript) when it has no timings or they no longer match
 * the transcript. The timing data is its own lazily loaded chunk: nobody pays for it until a full player opens.
 */
export function useTimedLines(
  episodeId: string | null,
  transcript: string | null,
): TimedLine[] | null {
  const [entry, setEntry] = useState<TimingEntry | undefined>(undefined);
  useEffect(() => {
    setEntry(undefined);
    if (!episodeId) return;
    let cancelled = false;
    import("../data/podcast-timings.json")
      .then((mod) => {
        const all = (mod.default ?? mod) as Record<string, TimingEntry>;
        if (!cancelled) setEntry(all[episodeId]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [episodeId]);
  return timedLinesFor(entry, transcript);
}
