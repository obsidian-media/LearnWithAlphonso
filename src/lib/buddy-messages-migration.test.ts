import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import fixtures from "./buddy.fixtures.json";
import { BUDDY_MESSAGES_PER_HOUR } from "./buddy";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const FILE = "20261007100000_buddy_messages.sql";
const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");
const fnBody = (name: string) => {
  const s = sql().slice(sql().indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`));
  return s.slice(0, s.indexOf("$$;"));
};

describe("buddy messages migration", () => {
  it("runs after the buddy pairing migration and its version is unique", () => {
    const others = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== FILE);
    expect(others.map((f) => f.slice(0, 14))).not.toContain(FILE.slice(0, 14));
    expect(FILE > "20261006180000_buddy_pairing.sql").toBe(true);
  });

  it("stores only a preset id from the shared list: no text column anywhere", () => {
    const table = sql().slice(sql().indexOf("CREATE TABLE public.buddy_messages ("));
    const body = table.slice(0, table.indexOf(");"));
    const ids = fixtures.presets.map((p) => `'${p.id}'`).join(", ");
    expect(body).toContain(`preset_id text NOT NULL CHECK (preset_id IN (${ids}))`);
    expect(body).not.toMatch(/\b(body|message|content|text_value)\b\s+text/);
    expect(fnBody("send_buddy_message")).toContain(`_preset IN (${ids})`);
  });

  it("has RLS on, an own-pairs SELECT policy, and grants clients SELECT only", () => {
    expect(sql()).toContain("ALTER TABLE public.buddy_messages ENABLE ROW LEVEL SECURITY;");
    expect(sql()).toMatch(
      /CREATE POLICY buddy_messages_select_own ON public\.buddy_messages FOR SELECT TO authenticated/,
    );
    expect(sql()).toContain("GRANT SELECT ON public.buddy_messages TO authenticated;");
    expect(sql()).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/);
    expect(sql()).toMatch(/sender_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
    expect(sql()).toMatch(
      /pair_id uuid NOT NULL REFERENCES public\.buddy_pairs\(id\) ON DELETE CASCADE/,
    );
  });

  it("every function is SECURITY DEFINER, pins search_path and UTC, and only authenticated may call it", () => {
    for (const sig of ["send_buddy_message(text)", "get_buddy_messages(timestamptz)"]) {
      const name = sig.slice(0, sig.indexOf("("));
      const body = fnBody(name);
      expect(body.slice(0, body.indexOf("AS $$"))).toMatch(
        /SECURITY DEFINER\nSET search_path = public\nSET timezone = 'UTC'/,
      );
      expect(sql()).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon;`);
      expect(sql()).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated;`);
    }
  });

  it("checks the hourly limit under the two-person lock, with the shared limit", () => {
    const body = fnBody("send_buddy_message");
    const lockAt = body.indexOf("PERFORM public._lock_buddy_users(");
    expect(lockAt).toBeGreaterThan(-1);
    expect(body.indexOf("interval '1 hour'")).toBeGreaterThan(lockAt);
    expect(body).toContain(`>= ${BUDDY_MESSAGES_PER_HOUR} THEN`);
  });

  it("re-reads the membership under the lock, so a message cannot land after an unfriend or block", () => {
    const body = fnBody("send_buddy_message");
    const lockAt = body.indexOf("PERFORM public._lock_buddy_users(");
    // The re-check must compare the SAME pair (a re-pairing with someone else in between must also stop the send).
    expect(body.indexOf("bm.user_id = me AND bm.pair_id = pid", lockAt)).toBeGreaterThan(lockAt);
  });

  it("reads only the caller's active pair", () => {
    expect(fnBody("get_buddy_messages")).toMatch(
      /FROM public\.buddy_members bm WHERE bm\.user_id = me/,
    );
  });
});
