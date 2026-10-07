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
  it("every public function is SECURITY DEFINER, pins search_path and UTC, and only authenticated may call it", () => {
    const pub = [
      "request_buddy(uuid)",
      "respond_buddy_request(uuid, boolean)",
      "cancel_buddy_request(uuid)",
      "end_buddy()",
      "get_buddy_requests()",
      "get_my_buddy()",
    ];
    for (const sig of pub) {
      const name = sig.slice(0, sig.indexOf("("));
      const body = sql().slice(sql().indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`));
      expect(body.slice(0, body.indexOf("AS $$"))).toMatch(
        /SECURITY DEFINER\nSET search_path = public\nSET timezone = 'UTC'/,
      );
      expect(sql()).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon;`);
      expect(sql()).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated;`);
    }
    for (const sig of [
      "_buddy_count(uuid, timestamptz, timestamptz)",
      "_create_buddy_pair(uuid, uuid, text)",
      "_resolve_buddy_pair(uuid)",
    ]) {
      expect(sql()).toContain(
        `REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`,
      );
    }
  });

  it("uses the shared goal of 3 lessons", () => {
    expect(sql()).toMatch(/goal constant integer := 3;/);
  });

  it("serialises week resolution per pair so two buddies opening the app at once resolve each week once", () => {
    expect(sql()).toMatch(/FROM public\.buddy_pairs bp WHERE bp\.id = _pair FOR UPDATE;/);
  });
});
