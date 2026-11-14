/**
 * The state mapping behind the redesigned social screens (Duels, League, Teams). The views only lay these results
 * out; the choices of what to say and which tone to use live here so they are tested. The iPhone's
 * SocialPresentation.swift makes the same choices.
 */

/** "1 pending · 1 active · 3 finished": only the parts that are not zero; null when every part is. */
export function duelsSummary(counts: {
  pending: number;
  active: number;
  finished: number;
}): string | null {
  const parts = [
    counts.pending > 0 ? `${counts.pending} pending` : null,
    counts.active > 0 ? `${counts.active} active` : null,
    counts.finished > 0 ? `${counts.finished} finished` : null,
  ].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

/** The learner's share of the XP earned in a duel so far, 0 to 1; an even split when neither has earned any. */
export function duelShare(mine: number, theirs: number): number {
  const m = Math.max(0, mine);
  const t = Math.max(0, theirs);
  return m + t > 0 ? m / (m + t) : 0.5;
}

export type DuelResultTone = "won" | "lost" | "tied" | "declined";

/** A finished duel's result for this learner: "Declined", "You won", "You lost" or "Tied". */
export function duelResult(
  status: string,
  winnerId: string | null | undefined,
  myId: string | null | undefined,
): { label: string; tone: DuelResultTone } {
  if (status === "declined") return { label: "Declined", tone: "declined" };
  if (winnerId) {
    return winnerId === myId
      ? { label: "You won", tone: "won" }
      : { label: "You lost", tone: "lost" };
  }
  return { label: "Tied", tone: "tied" };
}

export type Medal = "gold" | "silver" | "bronze";

/** The top three ranks get a medal; every other rank is a plain number. */
export function medalFor(rank: number): Medal | null {
  return rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : null;
}

/** Join by code is possible once something is typed (blank space is not a code). */
export function canJoin(code: string): boolean {
  return code.trim().length > 0;
}

/** Create team is possible once the name has a letter in it. */
export function canCreate(name: string): boolean {
  return name.trim().length > 0;
}

/** "Treetop league": the learner's tier by its display name; null when no tier is known. */
export function tierTitle(label: string | null | undefined): string | null {
  return label ? `${label} league` : null;
}
