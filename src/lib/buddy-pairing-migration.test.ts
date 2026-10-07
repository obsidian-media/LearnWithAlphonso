import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const FILE = "20261006180000_buddy_pairing.sql";
const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");

describe("buddy pairing migration", () => {
  it("is newer than every other migration's version and the version is unique", () => {
    const others = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== FILE);
    expect(others.map((f) => f.slice(0, 14))).not.toContain(FILE.slice(0, 14));
    expect(FILE > "20261006170000_fix_team_joins_and_course_aware_payouts.sql").toBe(true);
  });

  it("creates the four tables with RLS on and cascades to auth.users", () => {
    for (const t of ["buddy_pairs", "buddy_members", "buddy_requests", "buddy_weeks"]) {
      expect(sql()).toMatch(new RegExp(`CREATE TABLE public\\.${t} \\(`));
      expect(sql()).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`));
    }
    expect(sql().match(/REFERENCES auth\.users\(id\) ON DELETE CASCADE/g)?.length).toBe(5);
  });

  it("enforces one active buddy per user with a primary key, not partial indexes", () => {
    expect(sql()).toMatch(
      /user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
    );
    expect(sql()).toMatch(/CHECK \(user_a < user_b\)/);
  });

  it("allows at most one pending request between two people, either direction", () => {
    expect(sql()).toMatch(
      /CREATE UNIQUE INDEX buddy_requests_one_pending ON public\.buddy_requests \(least\(from_user, to_user\), greatest\(from_user, to_user\)\) WHERE status = 'pending';/,
    );
  });

  it("grants clients only SELECT, each backed by an own-rows policy; buddy_members is server-only", () => {
    expect(sql()).toMatch(/-- client-grants: none public\.buddy_members/);
    for (const t of ["buddy_pairs", "buddy_requests", "buddy_weeks"]) {
      expect(sql()).toMatch(
        new RegExp(`CREATE POLICY ${t}_select_own ON public\\.${t} FOR SELECT TO authenticated`),
      );
      expect(sql()).toMatch(new RegExp(`GRANT SELECT ON public\\.${t} TO authenticated;`));
    }
    expect(sql()).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/);
  });

  it("ends the pair when the friendship is deleted or either side blocks", () => {
    expect(sql()).toMatch(
      /CREATE TRIGGER buddy_end_on_unfriend AFTER DELETE ON public\.friendships/,
    );
    expect(sql()).toMatch(
      /CREATE TRIGGER buddy_end_on_block AFTER INSERT ON public\.blocked_users/,
    );
  });
});
