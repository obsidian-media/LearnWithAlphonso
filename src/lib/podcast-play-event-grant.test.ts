import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the hardening of `podcast_play_events`: the table shipped with a
 * direct INSERT grant to `authenticated`, so any signed-in client could
 * write rows with arbitrary `seconds_listened` and arbitrary `started_at`,
 * for any episode id -- including unpublished ones, since foreign keys do
 * not consult RLS. That table is the sole evidence base Phase 2's XP and
 * SRS wiring will be built on, and it is live and accumulating rows today.
 *
 * Same shape the repo already applied to the gamification tables in
 * 20260920050000_revoke_direct_gamification_writes.sql: revoke the direct
 * grant, and give clients a SECURITY DEFINER function that validates
 * before it writes.
 */
// Located by NAME, not by version prefix -- see podcast-schema.test.ts's
// comment for why (a version collision renumbered a migration hours after
// it landed).
const MIGRATIONS_DIR = "supabase/migrations";
const matches = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith("_podcast_play_event_rpc.sql"))
  .sort();
if (matches.length !== 1) {
  throw new Error(
    `expected exactly one *_podcast_play_event_rpc.sql in ${MIGRATIONS_DIR}, found ${matches.length}`,
  );
}
const sql = readFileSync(path.join(MIGRATIONS_DIR, matches[0]!), "utf8");

describe("podcast_play_events hardening", () => {
  it("revokes the direct INSERT grant that let clients write arbitrary rows", () => {
    expect(sql).toMatch(/REVOKE INSERT ON public\.podcast_play_events FROM authenticated/);
  });

  it("keeps SELECT, which the GDPR export reads", () => {
    // account.functions.ts exports this table via .eq("user_id", ...).
    // Revoking SELECT would silently produce an incomplete export -- the
    // exact drift account.functions.test.ts exists to catch.
    expect(sql).not.toMatch(/REVOKE[^;]*SELECT[^;]*podcast_play_events[^;]*FROM authenticated/);
  });

  it("replaces it with a SECURITY DEFINER function", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.record_podcast_play_event/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path TO 'public'/);
  });

  it("follows the repo's grant pattern for that function", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.record_podcast_play_event\([^)]*\) FROM public, anon/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.record_podcast_play_event\([^)]*\) TO authenticated, service_role/,
    );
  });

  it("takes the caller's identity from auth.uid(), never from an argument", () => {
    // A user_id parameter would recreate the hole in a new shape: any
    // client could attribute listening to somebody else.
    expect(sql).toMatch(/auth\.uid\(\)/);
    expect(sql).not.toMatch(/record_podcast_play_event\([^)]*_user_id/);
  });

  it("refuses to record against an episode that is not published", () => {
    expect(sql).toMatch(/published/);
  });

  it("bounds seconds_listened by the episode's real duration", () => {
    // The arbitrary-value vector: without a bound, any client can claim
    // any number of seconds listened and inflate the evidence base.
    expect(sql).toMatch(/LEAST/);
    expect(sql).toMatch(/duration_seconds/);
  });

  it("sets started_at server-side rather than accepting it from the client", () => {
    expect(sql).not.toMatch(/record_podcast_play_event\([^)]*_started_at/);
  });
});

describe("the live write path moves with the grant", () => {
  const source = readFileSync("src/lib/podcast.functions.ts", "utf8");

  it("records play events through the function", () => {
    expect(source).toMatch(/\.rpc\(\s*"record_podcast_play_event"/);
  });

  // Phase 1a is live. Revoking the grant without moving the write path --
  // or letting a direct insert creep back in later -- does not fail loudly:
  // it fails as permission denied inside a fire-and-forget call the player
  // deliberately swallows, so play recording just silently stops.
  it("never inserts into podcast_play_events directly", () => {
    expect(source).not.toMatch(/from\(\s*"podcast_play_events"\s*\)\s*\.insert/);
  });
});
