import { describe, expect, it } from "vitest";
import {
  migrationVersion,
  newestVersion,
  outOfOrderMigrations,
} from "../../scripts/check-migration-order";

const base = [
  "supabase/migrations/20261121110000_podcast_quiz_seed_r47.sql",
  "supabase/migrations/20261122100000_branching_stories.sql",
  "supabase/migrations/20261124100000_stories_batch_r57.sql",
];

describe("migrationVersion", () => {
  it("reads the leading digits of a versioned .sql file", () => {
    expect(migrationVersion("supabase/migrations/20261124100000_x.sql")).toBe(20261124100000n);
    expect(migrationVersion("supabase\\migrations\\20261124100000_x.sql")).toBe(20261124100000n);
  });

  it("ignores files that are not versioned migrations", () => {
    expect(migrationVersion("supabase/migrations/README.md")).toBeNull();
    expect(migrationVersion("supabase/migrations/seed.sql")).toBeNull();
    expect(migrationVersion("supabase/migrations/20261124100000_x.sql.bak")).toBeNull();
  });
});

describe("newestVersion", () => {
  it("compares numerically, not by list order", () => {
    expect(newestVersion([base[2], base[0], base[1]])).toBe(20261124100000n);
  });
  it("is null with no migrations", () => {
    expect(newestVersion([])).toBeNull();
  });
});

describe("outOfOrderMigrations", () => {
  it("passes an added migration newer than base's newest", () => {
    expect(outOfOrderMigrations(base, ["supabase/migrations/20261125090000_new.sql"])).toEqual([]);
  });

  it("flags an added migration older than base's newest (the db push refusal case)", () => {
    const bad = outOfOrderMigrations(base, ["supabase/migrations/20261123000000_late.sql"]);
    expect(bad).toEqual([
      {
        file: "supabase/migrations/20261123000000_late.sql",
        version: 20261123000000n,
        baseNewest: 20261124100000n,
      },
    ]);
  });

  it("flags an added migration EQUAL to base's newest", () => {
    expect(
      outOfOrderMigrations(base, ["supabase/migrations/20261124100000_dupe.sql"]),
    ).toHaveLength(1);
  });

  it("flags only the offending file when several are added", () => {
    const bad = outOfOrderMigrations(base, [
      "supabase/migrations/20261126000000_ok.sql",
      "supabase/migrations/20261101000000_old.sql",
    ]);
    expect(bad.map((b) => b.file)).toEqual(["supabase/migrations/20261101000000_old.sql"]);
  });

  it("does not flag a version that only sorts lower as a string", () => {
    // 9-digit vs 14-digit: string order would call "9..." newest.
    expect(outOfOrderMigrations(["supabase/migrations/900000000_a.sql"], [base[0]])).toEqual([]);
  });

  it("passes when nothing is added or base has no migrations", () => {
    expect(outOfOrderMigrations(base, [])).toEqual([]);
    expect(outOfOrderMigrations([], ["supabase/migrations/20200101000000_a.sql"])).toEqual([]);
  });
});
