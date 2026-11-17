/**
 * The learner-facing view of GET /api/ai-usage, as pure functions. The client holds no limit and no dollar figure:
 * the route sends a state, a percent and a reset instant, and this turns them into words and a meter.
 *
 * Fail-safe: anything the route did not promise (unknown state, missing or odd fields, a failed call) is `null`,
 * which the screen draws as nothing. Our own read error is never shown to the learner as a scare.
 */
import { resetDateLabel } from "./ai-monthly-cap";

export type AiUsageState = "ok" | "warn" | "capped";

export type AiUsageView = {
  state: AiUsageState;
  /** Whole percent, 0 to 100, clamped. */
  percent: number;
  /** The short state word, shown next to the meter so colour is never the only signal. */
  label: string;
  /** One kind sentence about where they stand. */
  message: string;
  /** Spoken value for the meter ("37 percent used, plenty left"). */
  valueText: string;
  /** "Resets on 1 December", or the date-free fallback when the instant cannot be read. */
  resetLine: string;
};

export const AI_USAGE_COPY = {
  title: "AI practice this month",
  /** Honest, plain: why a limit exists, that it resets, that normal use is nowhere near it. */
  explain:
    "Heavy AI features, like Hector's voice calls and explanations, have a monthly limit that keeps the app sustainable. It resets every month, and normal use never reaches it.",
  stillWorks: "Lessons and review always work.",
} as const;

const LABELS: Record<AiUsageState, string> = {
  ok: "Plenty left",
  warn: "Getting close",
  capped: "Limit reached",
};

const MESSAGES: Record<AiUsageState, string> = {
  ok: "You are well within this month's AI practice.",
  warn: "You have used most of this month's AI practice.",
  capped: "AI practice is paused for now.",
};

export function parseAiUsage(raw: unknown): AiUsageView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const state = r.state;
  if (state !== "ok" && state !== "warn" && state !== "capped") return null;
  const n = typeof r.percentUsed === "number" ? r.percentUsed : NaN;
  if (!Number.isFinite(n)) return null;
  // A capped learner is always at the end of the meter, whatever the number says.
  const percent = state === "capped" ? 100 : Math.min(100, Math.max(0, Math.floor(n)));
  const date = typeof r.resetsAt === "string" ? resetDateLabel(r.resetsAt) : null;
  const resetLine = date ? `Resets on ${date}` : "Resets at the start of next month";
  return {
    state,
    percent,
    label: LABELS[state],
    message: MESSAGES[state],
    valueText: `${percent} percent used, ${LABELS[state].toLowerCase()}`,
    resetLine,
  };
}
