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

export type BadgeEntry = { state: BadgeState; value: number | null };

/**
 * The state of every badge in a catalog (the iPhone's BadgePresentation.states). A badge is earned when the server
 * says so. Of the ones left in a family, only the next one up (the lowest threshold still unmet) shows progress, and
 * only when the learner has started on that family; the rest stay locked. A stat already past the threshold but not
 * yet granted is a full ring. The team badge is granted by the server alone, so it never shows a ring, and a family
 * the stats do not cover (or a stat of 0) stays locked. The freeze stat is the freezes held now: nothing on the
 * client counts freezes earned, on web or on the iPhone.
 */
export function badgeStates(
  catalog: readonly { id: string; category: string; threshold: number }[],
  unlocked: ReadonlySet<string>,
  stats: Readonly<Record<string, number | undefined>>,
): Record<string, BadgeEntry> {
  const out: Record<string, BadgeEntry> = {};
  for (const a of catalog)
    out[a.id] = { state: unlocked.has(a.id) ? "earned" : "locked", value: null };
  const families = new Map<string, { id: string; threshold: number }>();
  for (const a of catalog) {
    if (unlocked.has(a.id) || a.category === "team" || a.threshold <= 0) continue;
    const cur = families.get(a.category);
    if (!cur || a.threshold < cur.threshold) families.set(a.category, a);
  }
  for (const [category, next] of families) {
    const value = stats[category];
    if (value !== undefined && value > 0) out[next.id] = { state: "progress", value };
  }
  return out;
}

/** The ring's fill, 0 to 1; 0 for anything that is not in progress. */
export function badgeRing(input: { value: number | null; threshold: number }): number {
  if (input.value === null || input.threshold <= 0) return 0;
  return Math.max(0, Math.min(1, input.value / input.threshold));
}

/** "12 of 30" with thousands separators, so "1,240 of 2,000". */
export function progressLine(value: number, threshold: number): string {
  const f = (n: number) => n.toLocaleString("en-US");
  return `${f(Math.min(value, threshold))} of ${f(threshold)}`;
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

/** The one celebratory line on the unlock sheet: streak and XP badges only (the others say nothing extra). */
export function unlockLine(a: { category: string; threshold: number }): string | null {
  if (a.category === "streak")
    return `Your streak just hit ${a.threshold} days. Keep it going tomorrow.`;
  if (a.category === "xp")
    return `You have earned ${a.threshold.toLocaleString("en-US")} XP in total.`;
  return null;
}

/** Alphonso's pose on the unlock sheet: the flame for a streak, the impressed one for everything else. */
export function unlockPose(a: { category: string }): "streak-flame" | "surprised-impressed" {
  return a.category === "streak" ? "streak-flame" : "surprised-impressed";
}
