/** The full player's sleep timer, as pure logic: the clock and the "episode ended" signal come in as arguments. */
export type SleepChoiceId = "off" | "15" | "30" | "45" | "end";

export const SLEEP_CHOICES: { id: SleepChoiceId; label: string; minutes: number | null }[] = [
  { id: "off", label: "Off", minutes: null },
  { id: "15", label: "15 min", minutes: 15 },
  { id: "30", label: "30 min", minutes: 30 },
  { id: "45", label: "45 min", minutes: 45 },
  { id: "end", label: "End of episode", minutes: null },
];

export type SleepState = { choice: SleepChoiceId; endsAtMs: number | null };

export const SLEEP_OFF: SleepState = { choice: "off", endsAtMs: null };

export function startSleep(choice: SleepChoiceId, nowMs: number): SleepState {
  const minutes = SLEEP_CHOICES.find((c) => c.id === choice)?.minutes ?? null;
  return { choice, endsAtMs: minutes === null ? null : nowMs + minutes * 60_000 };
}

/** Milliseconds left on a timed choice (never negative); null for off and end of episode. */
export function sleepRemainingMs(state: SleepState, nowMs: number): number | null {
  if (state.endsAtMs === null) return null;
  return Math.max(0, state.endsAtMs - nowMs);
}

/** True when playback should pause now: a timed choice reached its deadline, or end-of-episode and it ended. */
export function sleepShouldPause(state: SleepState, nowMs: number, episodeEnded: boolean): boolean {
  if (state.choice === "end") return episodeEnded;
  return state.endsAtMs !== null && nowMs >= state.endsAtMs;
}
