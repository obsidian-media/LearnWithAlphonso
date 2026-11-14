import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFullSchema } from "./__testutils__/full-schema";
import { USER_DELETE_TABLES } from "./account.functions";

/**
 * Account deletion and the Help chat, against the whole migration history: removing the account (a service-role
 * deletion skips deleteMyAccount's RLS pre-delete loop entirely) must still take every conversation, message and note
 * with it, through ON DELETE CASCADE, even though messages are append-only.
 */
const L = "00000000-0000-4000-8000-0000000000a9";
const OTHER = "00000000-0000-4000-8000-0000000000b9";
const STAFF = "00000000-0000-4000-8000-0000000000c9";
let db: PGlite;
beforeAll(async () => {
  db = await buildFullSchema();
}, 600_000);
afterAll(async () => {
  await db.close();
});

const n = async (sql: string) =>
  Number((await db.query<{ n: string }>(`SELECT count(*)::text n FROM ${sql}`)).rows[0]!.n);

describe("deleting the account", () => {
  it("removes the learner's conversations, messages and notes, and nobody else's", async () => {
    await db.exec(
      `INSERT INTO auth.users (id, email) VALUES ('${L}','l@example.com'), ('${OTHER}','o@example.com')`,
    );
    for (const u of [L, OTHER]) {
      await db.query("SELECT public.support_open_conversation($1,'web')", [u]);
      const conv = (
        await db.query<{ id: string }>(
          "SELECT id FROM public.support_conversations WHERE user_id=$1",
          [u],
        )
      ).rows[0]!.id;
      await db.query("SELECT public.support_add_learner_message($1,$2,'hello',null)", [u, conv]);
      await db.query("SELECT public.support_add_ai_message($1,'hi','{}'::jsonb,null)", [conv]);
      await db.query(
        "INSERT INTO public.support_notes (conversation_id, author_id, body) VALUES ($1,$2,'note')",
        [conv, STAFF],
      );
    }
    expect(await n("public.support_messages")).toBe(4);
    await db.query("DELETE FROM auth.users WHERE id = $1", [L]);
    expect(await n(`public.support_conversations WHERE user_id='${L}'`)).toBe(0);
    expect(await n(`public.support_messages WHERE user_id='${L}'`)).toBe(0);
    expect(await n("public.support_notes")).toBe(1);
    expect(await n(`public.support_conversations WHERE user_id='${OTHER}'`)).toBe(1);
    expect(await n(`public.support_messages WHERE user_id='${OTHER}'`)).toBe(2);
  });

  it("needs no pre-delete call: the support tables are not in the RLS-scoped delete list", () => {
    expect([...USER_DELETE_TABLES]).not.toContain("support_messages");
    expect([...USER_DELETE_TABLES]).not.toContain("support_conversations");
  });
});
