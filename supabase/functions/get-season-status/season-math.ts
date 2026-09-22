// Pure logic for season-ladder resolution -- deliberately no Supabase
// client, no I/O, so it's testable without a database. Consumed by
// index.ts, which handles all the actual reads/writes.

/** Monday of `now`'s ISO week, as YYYY-MM-DD. Same boundary as
 *  get_leaderboard/weekly_xp's SQL definition
 *  (current_date - (isodow - 1)), reimplemented here in TS since this
 *  runs before any DB round trip. */
export function weekStartFor(now: Date): string {
  const isoDow = now.getUTCDay() === 0 ? 7 : now.getUTCDay(); // Sun=0 -> 7
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (isoDow - 1));
  return monday.toISOString().slice(0, 10);
}

export type CohortMember = { userId: string; xp: number };
export type RankedMember = { userId: string; rank: number };
export type Promotion = { userId: string; newDivision: number };

/** Descending by xp; ties broken by userId for deterministic,
 *  reproducible results (matters for tests and for not depending on
 *  whatever order Postgres happened to return rows in). */
export function rankCohort(members: CohortMember[]): RankedMember[] {
  return [...members]
    .sort((a, b) => (b.xp - a.xp) || a.userId.localeCompare(b.userId))
    .map((m, i) => ({ userId: m.userId, rank: i + 1 }));
}

const MIN_DIVISION = 1;
const MAX_DIVISION = 5;

/** floor(size/3) promote one division, floor(size/6) demote one --
 *  never round, so a cohort too small to move anyone (size 1 or 2)
 *  safely resolves to zero movement. Division 5 has no promotion
 *  target, Division 1 has no demotion target -- those ranks just stay. */
export function computePromotions(ranked: RankedMember[], currentDivision: number): Promotion[] {
  const size = ranked.length;
  const promoteCount = Math.floor(size / 3);
  const demoteCount = Math.floor(size / 6);
  const promoteDivision = Math.min(currentDivision + 1, MAX_DIVISION);
  const demoteDivision = Math.max(currentDivision - 1, MIN_DIVISION);

  return ranked.map((m) => {
    if (m.rank <= promoteCount) return { userId: m.userId, newDivision: promoteDivision };
    if (m.rank > size - demoteCount) return { userId: m.userId, newDivision: demoteDivision };
    return { userId: m.userId, newDivision: currentDivision };
  });
}
