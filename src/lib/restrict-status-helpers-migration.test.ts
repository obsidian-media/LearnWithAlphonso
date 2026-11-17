import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** 20261120110000: status helpers are server-only; the friends list still works. EXECUTED in PGlite. */
const FILE = "20261120110000_restrict_status_helper_functions.sql";
const sqlText = readFileSync(path.join(process.cwd(), "supabase/migrations", FILE), "utf8");
const U = (c: string) => `${c.repeat(8)}-0000-4000-8000-${c.repeat(12)}`;
const [A, B, C, D] = [U("a"), U("b"), U("c"), U("d")];

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    CREATE TABLE public.user_restrictions (user_id uuid, kind text, lifted_at timestamptz);
    CREATE TABLE public.friendships (user_id uuid, friend_id uuid, status text DEFAULT 'accepted');
    CREATE TABLE public.team_members (team_id uuid, user_id uuid);
    CREATE TABLE public.blocked_users (blocker uuid, blocked uuid);
    CREATE TABLE public.friend_activity_events (user_id uuid);
    CREATE TABLE public.nudges (sender_id uuid, recipient_id uuid);
    CREATE FUNCTION public._my_team_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
      AS $$ SELECT team_id FROM public.team_members WHERE user_id = auth.uid() LIMIT 1 $$;
    CREATE POLICY friend_activity_readable_by_friends ON public.friend_activity_events FOR SELECT TO authenticated USING (true);
    CREATE POLICY nudges_insert_to_friend ON public.nudges FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY team_members_select_own_team ON public.team_members FOR SELECT TO authenticated USING (true);
    GRANT SELECT ON public.blocked_users, public.friendships, public.team_members, public.friend_activity_events TO authenticated; GRANT INSERT ON public.nudges TO authenticated;
    ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY; ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY; ALTER TABLE public.friend_activity_events ENABLE ROW LEVEL SECURITY; ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION public.is_restricted(p_user uuid, p_kind text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
      AS $$ SELECT EXISTS (SELECT 1 FROM public.user_restrictions r WHERE r.user_id = p_user AND r.kind = p_kind AND r.lifted_at IS NULL) $$;
    CREATE FUNCTION public.is_social_restricted(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
      AS $$ SELECT public.is_restricted(p_user, 'block') OR public.is_restricted(p_user, 'ban') $$;
    CREATE POLICY fr_view_own ON public.friendships FOR SELECT TO authenticated
      USING (((SELECT auth.uid()) = user_id) OR (((SELECT auth.uid()) = friend_id) AND (NOT public.is_social_restricted(user_id))));
    INSERT INTO public.friendships VALUES ('${B}','${A}'), ('${C}','${A}'), ('${A}','${D}'), ('${A}','${B}'), ('${A}','${C}');
    INSERT INTO public.user_restrictions VALUES ('${C}','ban', NULL);
    INSERT INTO public.team_members VALUES ('${U("1")}','${A}'), ('${U("1")}','${B}'), ('${U("1")}','${C}'), ('${U("2")}','${D}');
    INSERT INTO public.friend_activity_events VALUES ('${B}'), ('${C}');
  `);
  await db.exec(sqlText);
});
afterAll(async () => db.close());

const as = async (role: string, uid: string | null, sql: string) => {
  await db.exec(`SET test.uid = '${uid ?? ""}'; SET ROLE ${role}`);
  try {
    return await db.query<Record<string, unknown>>(sql);
  } finally {
    await db.exec("RESET ROLE");
  }
};
const canExec = async (role: string, fn: string) =>
  (
    await db.query<{ ok: boolean }>(
      `SELECT has_function_privilege('${role}', '${fn}', 'execute') AS ok`,
    )
  ).rows[0].ok;

describe("restriction status helpers", () => {
  it("clients cannot execute them; the service role still can", async () => {
    for (const fn of ["public.is_restricted(uuid,text)", "public.is_social_restricted(uuid)"]) {
      expect(await canExec("authenticated", fn)).toBe(false);
      expect(await canExec("anon", fn)).toBe(false);
      expect(await canExec("service_role", fn)).toBe(true);
    }
  });
  it("a signed-in user calling the helper directly is refused", async () => {
    await expect(
      as("authenticated", A, `SELECT public.is_social_restricted('${C}')`),
    ).rejects.toThrow(/permission denied/);
  });
  it("the service role still reads the real answer", async () => {
    expect(
      (await as("service_role", null, `SELECT public.is_social_restricted('${C}') AS r`)).rows[0].r,
    ).toBe(true);
    expect(
      (await as("service_role", null, `SELECT public.is_social_restricted('${B}') AS r`)).rows[0].r,
    ).toBe(false);
  });
  it("the friends list still works: own rows and unrestricted incoming rows show, restricted ones stay hidden", async () => {
    const rows = (await as("authenticated", A, "SELECT user_id, friend_id FROM public.friendships"))
      .rows;
    const ids = rows.map((r) => `${r.user_id}>${r.friend_id}`).sort();
    expect(ids).toEqual([`${A}>${D}`, `${A}>${B}`, `${A}>${C}`, `${B}>${A}`].sort());
  });
  it("team list and friend activity keep working, a restricted member stays hidden", async () => {
    const t = await as("authenticated", A, "SELECT user_id FROM public.team_members");
    expect(t.rows.map((r) => r.user_id).sort()).toEqual([A, B].sort());
    const f = await as("authenticated", A, "SELECT user_id FROM public.friend_activity_events");
    expect(f.rows.map((r) => r.user_id)).toEqual([B]);
  });
  it("the policy helper answers nothing about a stranger", async () => {
    const r = await as("authenticated", D, `SELECT public.policy_social_restricted('${C}') AS v`);
    expect(r.rows[0].v).toBe(true); // fail closed: no relationship, no real answer
  });
});
