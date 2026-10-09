/**
 * What the review/demo account is seeded with. The values are public on purpose (this repository
 * is public); the account's own email address is never in code, it comes from the environment.
 */
export const DEMO_SEED = {
  displayName: "Alex",
  resumeEpisodeSlug: "ordering-coffee-v2",
  placements: [
    { language: "en", level: "B2", xp: 3600 },
    { language: "fr", level: "A2", xp: 0 },
    { language: "es", level: "A2", xp: 0 },
  ],
  /**
   * A second demo learner the account is pre-paired with as a matched pair, so a reviewer can see
   * the "Matched learner" card, its preset messages, and Block/Report without waiting for a real
   * match. example.com is reserved (RFC 2606): it is nobody's mailbox. She has no XP and no completions,
   * so she never shows on a leaderboard or in a league: only the study-buddy pairing needs her.
   */
  buddy: {
    email: "demo-study-buddy@example.com",
    displayName: "Marie",
    presets: ["nice_work", "keep_going"],
  },
} as const;

export type EpisodeRow = {
  id: string;
  slug: string;
  course: string | null;
  published: boolean;
  duration_seconds: number;
};

export function pickResumeEpisode(rows: EpisodeRow[]): EpisodeRow {
  const hits = rows.filter(
    (r) => r.slug === DEMO_SEED.resumeEpisodeSlug && r.course === "en" && r.published,
  );
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly one published en "${DEMO_SEED.resumeEpisodeSlug}", found ${hits.length}`,
    );
  }
  return hits[0];
}

/** The pair helper answers with a status string; only 'paired' means the demo pairing now exists. */
export function assertDemoPaired(status: string | null): void {
  if (status !== "paired")
    throw new Error(`demo pairing was not created (helper said ${String(status)})`);
}

/** Throws if any write in a batch failed, naming the step. A seed that half-succeeds must not look finished. */
export function assertNoWriteErrors(
  label: string,
  results: { error: { message: string } | null }[],
): void {
  const failures = results.flatMap((r) => (r.error ? [r.error.message] : []));
  if (failures.length > 0)
    throw new Error(`${label}: ${failures.length} write(s) failed: ${failures.join("; ")}`);
}

/** What the seed reads back from the database to prove the reviewer will see what the notes promise. */
export type DemoSeedState = {
  profile: {
    display_name: string | null;
    name_confirmed_at: string | null;
    ai_consent_at: string | null;
  } | null;
  poolRows: number;
  languages: string[];
  excluded: boolean;
  pair: { source: string; endedAt: string | null; memberIds: string[] } | null;
};

export function demoSeedProblems(state: DemoSeedState, demoId: string, buddyId: string): string[] {
  const p: string[] = [];
  if (!state.profile) p.push("profile: no row for the demo account");
  else {
    if (state.profile.ai_consent_at !== null) p.push("profile: ai_consent_at is not NULL");
    if (state.profile.name_confirmed_at === null) p.push("profile: name_confirmed_at is NULL");
    if (state.profile.display_name !== DEMO_SEED.displayName)
      p.push(`profile: display_name is not ${DEMO_SEED.displayName}`);
  }
  if (state.poolRows !== 0) p.push(`buddy_pool: ${state.poolRows} row(s) for the demo account`);
  const expected = DEMO_SEED.placements.map((x) => x.language).sort();
  if (JSON.stringify([...state.languages].sort()) !== JSON.stringify(expected))
    p.push(
      `language_progress: have ${[...state.languages].sort().join(",")}, expected ${expected.join(",")}`,
    );
  if (!state.excluded)
    p.push("buddy_pool_exclusions: the demo account is not excluded from matching");
  if (!state.pair) p.push("pair: the demo account has no study buddy pair");
  else {
    if (state.pair.source !== "match")
      p.push(`pair: source is ${state.pair.source}, expected match`);
    if (state.pair.endedAt) p.push("pair: it has ended");
    if (
      ![demoId, buddyId].every((id) => state.pair!.memberIds.includes(id)) ||
      state.pair.memberIds.length !== 2
    )
      p.push("pair: it is not between the demo account and the demo learner");
  }
  return p;
}
