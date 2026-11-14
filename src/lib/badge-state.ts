/**
 * What a badge on the Achievements screen looks like, as pure functions: its art, its state (earned, in progress or
 * locked), how full the ring is and the "12 of 30" line. The team badge is granted by the server only, so it has no
 * progress and is never "in progress". iOS and Android make the same choices.
 */

export type BadgeState = "earned" | "progress" | "locked";

/** The art for an achievement: one file per catalog id in public/badges. */
export function badgeSrc(id: string): string {
  return `/badges/${id}.webp`;
}

/**
 * Earned once unlocked; in progress when the learner has made some headway toward a threshold that can be counted;
 * otherwise locked. `value` is null for a badge nothing on the client counts (the team badge).
 */
export function badgeState(input: {
  unlocked: boolean;
  value: number | null;
  threshold: number;
}): BadgeState {
  if (input.unlocked) return "earned";
  if (input.value !== null && input.value > 0 && input.value < input.threshold) return "progress";
  return "locked";
}

/** The ring's fill, 0 to 1; 0 for anything that is not in progress. */
export function badgeRing(input: { value: number | null; threshold: number }): number {
  if (input.value === null || input.threshold <= 0) return 0;
  return Math.max(0, Math.min(1, input.value / input.threshold));
}

/** "12 of 30" with thousands separators, so "1,240 of 2,000". */
export function progressLine(value: number, threshold: number): string {
  const f = (n: number) => n.toLocaleString("en-US");
  return `${f(value)} of ${f(threshold)}`;
}

/** "7 of 25 unlocked". */
export function unlockedLine(unlocked: number, total: number): string {
  return `${unlocked} of ${total} unlocked`;
}

/** The two top rungs (a year's streak, 25,000 XP) are "diamond prime": a diamond with wings. */
const PRIME = new Set(["streak_365", "xp_25000"]);

export function tierLabel(a: { id: string; tier: string }): string {
  if (PRIME.has(a.id)) return "Diamond prime";
  return a.tier.charAt(0).toUpperCase() + a.tier.slice(1);
}

const FAMILY_NAMES: Record<string, string> = {
  streak: "Streak",
  xp: "XP",
  perfect: "Perfect lessons",
  lessons: "Lessons",
  league: "League",
  freeze: "Streak freeze",
  team: "Team",
};

/** "Streak ladder". */
export function ladderTitle(category: string): string {
  return `${FAMILY_NAMES[category] ?? category} ladder`;
}

/** The date an unlock happened, "Nov 9, 2026", in a fixed English form; null when unknown or not a date. */
export function unlockedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
