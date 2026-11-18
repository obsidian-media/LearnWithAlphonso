// Drives the real start-lesson-session handler with fake dependencies: no network, no database, no secrets.
// Run: deno test --allow-env --config supabase/functions/start-lesson-session/deno.json supabase/functions/start-lesson-session/handler.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStartLessonSessionHandler, type StartLessonSessionDeps } from "./handler.ts";

type Row = Record<string, unknown>;

/** The subset of supabase-js the handler reads, over in-memory tables. */
class FakeDb {
  lesson: { id: string; course: string } | null = { id: "u1l1", course: "fr" };
  progress: Row | null = null;
  failReads = new Set<string>();
  from(table: string) {
    const filters: Record<string, unknown> = {};
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return q;
      },
      maybeSingle: () => {
        if (this.failReads.has(table)) {
          return Promise.resolve({ data: null, error: { message: "read failed" } });
        }
        if (table === "lessons") {
          const l = this.lesson;
          const match = l && filters["id"] === l.id && filters["units.course"] === l.course;
          return Promise.resolve({ data: match ? { id: l!.id } : null, error: null });
        }
        return Promise.resolve({ data: this.progress, error: null });
      },
    };
    return q;
  }
  client() {
    return this as unknown as SupabaseClient;
  }
}

const NOW = Date.parse("2026-11-17T12:00:00Z");
const USER = "user-1";

function setup(opts: { pro?: boolean | null; enforced?: boolean; auth?: Response } = {}) {
  const db = new FakeDb();
  const issued: unknown[] = [];
  const deps: StartLessonSessionDeps = {
    authenticate: () => Promise.resolve(opts.auth ?? { userId: USER }),
    admin: () => db.client(),
    heartsGateEnforced: () => opts.enforced ?? true,
    heartsUnlimited: () => Promise.resolve(opts.pro === undefined ? false : opts.pro),
    issueToken: (claim) => {
      issued.push(claim);
      return "signed-token";
    },
    now: () => NOW,
  };
  return { db, issued, handler: createStartLessonSessionHandler(deps) };
}

function post(body: unknown, method = "POST") {
  return new Request("http://local/start-lesson-session", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}
const ok = { lessonId: "u1l1", course: "fr" };
const zeroHearts: Row = { hearts: 0, hearts_refill_at: new Date(NOW + 20 * 60_000).toISOString() };

Deno.test("happy path: a token for this user, lesson and course", async () => {
  const { handler, issued } = setup();
  const res = await handler(post(ok));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { token: "signed-token" });
  assertEquals(issued, [{ userId: USER, lessonId: "u1l1", course: "fr" }]);
});

Deno.test("method, auth and body are checked first", async () => {
  assertEquals((await setup().handler(post(ok, "GET"))).status, 405);
  assertEquals((await setup({ auth: new Response("no", { status: 401 }) }).handler(post(ok))).status, 401);
  assertEquals((await setup().handler(post({ lessonId: "BAD ID", course: "fr" }))).status, 400);
});

Deno.test("a lesson that truly does not exist (or is in the other course) is 404", async () => {
  const { handler, issued } = setup();
  assertEquals((await handler(post({ lessonId: "nope", course: "fr" }))).status, 404);
  assertEquals((await handler(post({ lessonId: "u1l1", course: "en" }))).status, 404);
  assertEquals(issued.length, 0);
});

Deno.test("a lesson read error is a retryable 503, never the permanent 404", async () => {
  const { handler, db, issued } = setup();
  db.failReads.add("lessons");
  assertEquals((await handler(post(ok))).status, 503);
  assertEquals(issued.length, 0);
});

Deno.test("0 hearts and not Pro: 409 out-of-hearts with the refill time, no token", async () => {
  const { handler, db, issued } = setup();
  db.progress = zeroHearts;
  const res = await handler(post(ok));
  assertEquals(res.status, 409);
  const json = await res.json();
  assertEquals(json.error, "out-of-hearts");
  assertEquals(json.refillAt, new Date(NOW + 20 * 60_000).toISOString());
  assertEquals(issued.length, 0);
});

Deno.test("0 hearts but Pro: the gate is bypassed", async () => {
  const { handler, db } = setup({ pro: true });
  db.progress = zeroHearts;
  assertEquals((await handler(post(ok))).status, 200);
});

Deno.test("0 hearts with the gate switched off: a token", async () => {
  const { handler, db } = setup({ enforced: false });
  db.progress = zeroHearts;
  assertEquals((await handler(post(ok))).status, 200);
});

Deno.test("0 hearts and Pro status unreadable: 503, not a 409 out-of-hearts", async () => {
  const { handler, db, issued } = setup({ pro: null });
  db.progress = zeroHearts;
  assertEquals((await handler(post(ok))).status, 503);
  assertEquals(issued.length, 0);
});

Deno.test("Pro status unreadable while hearts remain: still a token (Pro is not needed)", async () => {
  const { handler, db } = setup({ pro: null });
  db.progress = { hearts: 3, hearts_refill_at: null };
  assertEquals((await handler(post(ok))).status, 200);
});

Deno.test("a hearts read error fails OPEN by design (economy rule): a token, neither a rejection nor a write", async () => {
  const { handler, db } = setup();
  db.failReads.add("user_progress");
  const res = await handler(post(ok));
  assertEquals(res.status, 200);
  assert((await res.json()).token);
});

Deno.test("no progress row is a new learner with a full set", async () => {
  const { handler, db } = setup();
  db.progress = null;
  assertEquals((await handler(post(ok))).status, 200);
});
