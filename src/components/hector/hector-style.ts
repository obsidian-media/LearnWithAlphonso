import { hectorStatusLabel, type HectorStatus } from "@/lib/hector-status";

/** The words in the status pill: green "Ready" at rest, then what he is doing. */
export function hectorPillText(status: HectorStatus | null): string {
  return status ? `${hectorStatusLabel(status)}…` : "Ready";
}

/** Hector: a white card. The learner: the choice colour. */
export function bubbleClass(role: "user" | "assistant"): string {
  return role === "assistant"
    ? "rounded-[18px] rounded-bl-[7px] bg-ds-card px-3.5 py-2.5 ds-type-footnote leading-relaxed text-ds-ink shadow-[var(--ds-shadow-resting)]"
    : "rounded-[18px] rounded-br-[7px] bg-ds-choice px-3.5 py-2.5 ds-type-footnote leading-relaxed text-ds-on-choice";
}
