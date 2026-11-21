import type { TileKind } from "./numbers-core";
import { formatUsd } from "./numbers-core";

/** "3h 02m" for a wait of an hour or more, "42m" below an hour, "<1m" under a minute. Null when the time is unusable. */
export function waitingLabel(sinceIso: string | null, now: number = Date.now()): string | null {
  if (!sinceIso) return null;
  const since = Date.parse(sinceIso);
  if (Number.isNaN(since)) return null;
  const minutes = Math.max(0, Math.floor((now - since) / 60_000));
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** A number as the Home tiles write it. A string is already written; the kind says the unit. */
export function formatFigure(value: number | string, kind: TileKind = "number"): string {
  if (typeof value === "string") return value;
  switch (kind) {
    case "usd":
      return formatUsd(value);
    case "money":
      return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    case "percent":
      return `${value}%`;
    case "days":
      return `${value} days`;
    case "rating":
      return value.toFixed(1);
    default:
      return value.toLocaleString("en-US");
  }
}

/** Time of day greeting word from the viewer's own clock hour (0-23). */
export function greetingWord(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** The status words the console uses for a ticket (owner ruling): what the staff member must do next. */
export const TICKET_STATUS_WORDS: Record<string, string> = {
  new: "New",
  open: "Needs reply",
  waiting_learner: "Waiting on learner",
  solved: "Resolved",
};

export const ticketStatusWord = (status: string): string => TICKET_STATUS_WORDS[status] ?? status;
