import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const FILE = "20261007120000_buddy_matching.sql";
const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");
const fnBody = (name: string) => {
  const s = sql().slice(sql().indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`));
  return s.slice(0, s.indexOf("$$;"));
};

describe("buddy matching migration", () => {
  it("runs after the buddy messages migration and its version is unique", () => {
    const others = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== FILE);
    expect(others.map((f) => f.slice(0, 14))).not.toContain(FILE.slice(0, 14));
    expect(FILE > "20261007100000_buddy_messages.sql").toBe(true);
  });

  it("has a server-only switch that turns matching off without a release", () => {
    expect(sql()).toMatch(/-- client-grants: none public\.buddy_settings/);
    expect(sql()).toMatch(/matching_enabled boolean NOT NULL DEFAULT true/);
    expect(fnBody("join_buddy_pool")).toContain("'matching_off'");
  });

  it("the pool is one row per learner, readable only by its owner, cascading with the account", () => {
    expect(sql()).toMatch(
      /user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
    );
    expect(sql()).toMatch(
      /CREATE POLICY buddy_pool_select_own ON public\.buddy_pool FOR SELECT TO authenticated/,
    );
    expect(sql()).toContain("GRANT SELECT ON public.buddy_pool TO authenticated;");
    expect(sql()).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/);
  });

  it("matches under one pool lock, same course, level within one step, never across a block or with a past buddy", () => {
    const body = fnBody("join_buddy_pool");
    expect(body).toContain("pg_advisory_xact_lock(hashtextextended('buddy:pool', 0))");
    expect(body).toMatch(/p\.course = _course/);
    expect(body).toMatch(
      /abs\(public\._cefr_rank\(p\.cefr_level\) - public\._cefr_rank\(mine\)\) <= 1/,
    );
    expect(body).toMatch(/FROM public\.blocked_users b/);
    expect(body).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM public\.buddy_pairs past/);
    expect(body).toContain("public._create_buddy_pair(me, candidate, 'match')");
  });

  it("_create_buddy_pair skips the friendship check only for matches, still checks blocks, and clears both pool rows", () => {
    const body = fnBody("_create_buddy_pair");
    expect(body).toMatch(
      /IF _source = 'friend' AND NOT EXISTS \(SELECT 1 FROM public\.friendships/,
    );
    expect(body).toContain("RETURN 'blocked';");
    expect(body).toContain("PERFORM public._lock_buddy_users(_x, _y);");
    expect(body).toMatch(/DELETE FROM public\.buddy_pool bpl WHERE bpl\.user_id IN \(_x, _y\)/);
  });

  it("get_my_buddy tells the client whether the buddy was matched (return type changed: dropped and re-granted)", () => {
    expect(sql()).toContain("DROP FUNCTION public.get_my_buddy();");
    expect(fnBody("get_my_buddy")).toMatch(/is_match boolean/);
    expect(sql()).toContain("GRANT EXECUTE ON FUNCTION public.get_my_buddy() TO authenticated;");
  });

  it("every public function is SECURITY DEFINER, pins search_path and UTC, and only authenticated may call it", () => {
    for (const sig of [
      "join_buddy_pool(text)",
      "leave_buddy_pool()",
      "get_buddy_pool()",
      "get_my_buddy()",
    ]) {
      const name = sig.slice(0, sig.indexOf("("));
      const body = fnBody(name);
      expect(body.slice(0, body.indexOf("AS $$"))).toMatch(
        /SECURITY DEFINER\nSET search_path = public\nSET timezone = 'UTC'/,
      );
      expect(sql()).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon;`);
      expect(sql()).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated;`);
    }
  });

  it("re-checks under the joiner's own lock that a friend pairing has not landed meanwhile, before waiting", () => {
    const body = fnBody("join_buddy_pool");
    const waitAt = body.indexOf("INSERT INTO public.buddy_pool");
    const ownLockAt = body.indexOf(
      "pg_advisory_xact_lock(hashtextextended('buddy:' || me::text, 0))",
    );
    expect(ownLockAt).toBeGreaterThan(
      body.indexOf("pg_advisory_xact_lock(hashtextextended('buddy:pool', 0))"),
    );
    expect(ownLockAt).toBeLessThan(waitAt);
    expect(body.indexOf("public.buddy_members", ownLockAt)).toBeLessThan(waitAt);
  });

  it("leaving takes the pool lock, so a match cannot land just after Stop looking", () => {
    expect(fnBody("leave_buddy_pool")).toContain(
      "pg_advisory_xact_lock(hashtextextended('buddy:pool', 0))",
    );
  });
});
