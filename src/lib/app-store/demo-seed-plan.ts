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
   * match. example.com is reserved (RFC 2606): it is nobody's mailbox.
   */
  buddy: {
    email: "demo-study-buddy@example.com",
    displayName: "Marie",
    course: "en",
    level: "B2",
    presets: ["nice_work", "keep_going"],
    lessonIds: ["u1l1", "u1l2"],
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
