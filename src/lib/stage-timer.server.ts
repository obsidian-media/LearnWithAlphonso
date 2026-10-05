/**
 * Per-stage wall-clock timing for an AI route, so a slow reply can be
 * attributed to a stage instead of guessed at.
 *
 * Why this exists: TestFlight/demo feedback (BACKLOG 0.0-z #3) reported
 * Practice and Hector replies taking 16-36 s, one never arriving. A single
 * Hector turn runs auth -> entitlement -> quota (itself several Supabase
 * round trips) -> NVIDIA -> Deepgram strictly in sequence, and the only
 * numbers anywhere were `llm_ms`/`tts_ms` inside the response body, which
 * nothing logs. Each stage is now timed, returned as a `Server-Timing`
 * header and written as one `[ai-timing]` log line per request, so the next
 * slow reply is diagnosable from Vercel's runtime logs alone.
 *
 * Pure apart from the injected clock and log sink, so it is unit-tested with
 * a hand-driven clock rather than real time.
 */
export type StageTimer = {
  /** Awaits `fn`, adding its duration to `name` whether it resolves or throws. */
  time<T>(name: string, fn: () => Promise<T>): Promise<T>;
  /** Accumulated milliseconds per stage, in first-seen order. */
  stages(): Record<string, number>;
  /** Milliseconds since the timer was created (includes unmeasured gaps). */
  totalMs(): number;
  /** Value for a `Server-Timing` response header. */
  serverTiming(): string;
  /** Writes one `[ai-timing]` line. `sink` defaults to console.info. */
  log(route: string, status: number, sink?: (line: string) => void): void;
};

export function createStageTimer(now: () => number = () => performance.now()): StageTimer {
  const startedAt = now();
  const durations = new Map<string, number>();

  return {
    async time(name, fn) {
      const stageStart = now();
      try {
        return await fn();
      } finally {
        durations.set(name, (durations.get(name) ?? 0) + (now() - stageStart));
      }
    },
    stages: () => Object.fromEntries(durations),
    totalMs: () => now() - startedAt,
    serverTiming() {
      const parts = [...durations].map(([name, ms]) => `${name};dur=${Math.round(ms)}`);
      parts.push(`total;dur=${Math.round(now() - startedAt)}`);
      return parts.join(", ");
    },
    log(route, status, sink = (line) => console.info(line)) {
      const stagePart = [...durations].map(([name, ms]) => `${name}=${Math.round(ms)}ms`);
      sink(
        [
          `[ai-timing] route=${route} status=${status}`,
          `total=${Math.round(now() - startedAt)}ms`,
          ...stagePart,
        ].join(" "),
      );
    },
  };
}
