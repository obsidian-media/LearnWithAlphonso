import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards the podcast library migration's load-bearing constraints. These
 * are text assertions rather than live-database assertions because this
 * repo has no containerised Postgres in CI -- the same reason
 * curriculum-consistency.test.ts checks shapes rather than querying.
 */
const sql = readFileSync("supabase/migrations/20260926010000_podcast_library.sql", "utf8");

describe("podcast library migration", () => {
  it("constrains sibling slugs for non-root folders", () => {
    expect(sql).toMatch(
      /UNIQUE INDEX podcast_folders_parent_slug_key[\s\S]*?WHERE parent_id IS NOT NULL/,
    );
  });

  it("also constrains root folder slugs, which the composite index cannot", () => {
    // Postgres treats NULL parent_id values as mutually distinct, so the
    // composite index above does not stop two roots both called "english".
    expect(sql).toMatch(
      /UNIQUE INDEX podcast_folders_root_slug_key[\s\S]*?WHERE parent_id IS NULL/,
    );
  });

  it("hides unpublished episodes from clients", () => {
    expect(sql).toMatch(/podcast_episodes_select_published[\s\S]*?USING \(published = true\)/);
  });

  it("grants no client write on folders or episodes", () => {
    expect(sql).not.toMatch(
      /GRANT (INSERT|UPDATE|DELETE)[^;]*podcast_(folders|episodes) TO authenticated/,
    );
  });

  it("scopes per-user playback and play events to their owner", () => {
    expect(sql).toMatch(/podcast_playback_own[\s\S]*?\(SELECT auth\.uid\(\)\) = user_id/);
    expect(sql).toMatch(/podcast_play_events_own[\s\S]*?\(SELECT auth\.uid\(\)\) = user_id/);
  });
});
