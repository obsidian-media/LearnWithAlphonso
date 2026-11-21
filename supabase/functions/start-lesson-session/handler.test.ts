// Drives the real start-lesson-session handler with fake dependencies: no network, no database, no secrets.
// Run: deno test --allow-env --config supabase/functions/start-lesson-session/deno.json supabase/functions/start-lesson-session/handler.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createStartLessonSessionHandler,
  lessonStartVerdict,
  type StartLessonSessionDeps,
} from "./handler.ts";

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

function setup(
  opts: {
    pro?: boolean | null;
    enforced?: boolean;
    auth?: Response;
    cached?: boolean | null;
    verdict?: "unlocked" | "locked" | "unknown";
  } = {},
) {
  const asked: unknown[][] = [];
  const db = new FakeDb();
  const issued: unknown[] = [];
  const deps: StartLessonSessionDeps = {
    authenticate: () => Promise.resolve(opts.auth ?? { userId: USER }),
    admin: () => db.client(),
    heartsGateEnforced: () => opts.enforced ?? true,
    heartsUnlimited: () => Promise.resolve(opts.pro === undefined ? false : opts.pro),
    heartsProCached: () => Promise.resolve(opts.cached ?? null),
    lessonStartVerdict: (_admin, userId, course, lessonId) => {
      asked.push([userId, course, lessonId]);
      return Promise.resolve(opts.verdict ?? "unlocked");
    },
    issueToken: (claim) => {
      issued.push(claim);
      return "signed-token";
    },
    now: () => NOW,
  };
  return { db, issued, asked, handler: createStartLessonSessionHandler(deps) };
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
  assertEquals(
    (await setup({ auth: new Response("no", { status: 401 }) }).handler(post(ok))).status,
    401,
  );
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

Deno.test(
  "0 hearts and Pro unknown with no stored answer: treated as not Pro, so the normal 409 (never a 503)",
  async () => {
    const { handler, db, issued } = setup({ pro: null, cached: null });
    db.progress = zeroHearts;
    const res = await handler(post(ok));
    assertEquals(res.status, 409);
    assertEquals((await res.json()).error, "out-of-hearts");
    assertEquals(issued.length, 0);
  },
);

Deno.test("0 hearts and Pro unknown: the last stored answer decides, at any age", async () => {
  const pro = setup({ pro: null, cached: true });
  pro.db.progress = zeroHearts;
  assertEquals((await pro.handler(post(ok))).status, 200);
  const notPro = setup({ pro: null, cached: false });
  notPro.db.progress = zeroHearts;
  assertEquals((await notPro.handler(post(ok))).status, 409);
});

Deno.test(
  "Pro status unreadable while hearts remain: still a token (Pro is not needed)",
  async () => {
    const { handler, db } = setup({ pro: null });
    db.progress = { hearts: 3, hearts_refill_at: null };
    assertEquals((await handler(post(ok))).status, 200);
  },
);

Deno.test(
  "a hearts read error fails OPEN by design (economy rule): a token, neither a rejection nor a write",
  async () => {
    const { handler, db } = setup();
    db.failReads.add("user_progress");
    const res = await handler(post(ok));
    assertEquals(res.status, 200);
    assert((await res.json()).token);
  },
);

Deno.test("no progress row is a new learner with a full set", async () => {
  const { handler, db } = setup();
  db.progress = null;
  assertEquals((await handler(post(ok))).status, 200);
});

Deno.test(
  "a lesson this learner has not unlocked: 409 lesson-locked, no token, asked about THIS user",
  async () => {
    const { handler, issued, asked } = setup({ verdict: "locked" });
    const res = await handler(post(ok));
    assertEquals(res.status, 409);
    assertEquals(await res.json(), { error: "lesson-locked" });
    assertEquals(issued.length, 0);
    assertEquals(asked, [[USER, "fr", "u1l1"]]);
  },
);

Deno.test("an unreadable unlock state lets the learner in (never a lockout)", async () => {
  const { handler, issued } = setup({ verdict: "unknown" });
  assertEquals((await handler(post(ok))).status, 200);
  assertEquals(issued.length, 1);
});

/** A fake database for the real lessonStartVerdict: lessons of one course (EN-style, bands interleaved), completions, a level. */
function verdictDb(opts: { done: string[]; level: string | null; failCompletions?: boolean }) {
  // Curriculum order is u1 (A1), u2 (A2), u3 (A1): sort_order interleaves bands, as the English course does.
  const lessons = [
    { id: "u1l1", sort_order: 0, units: { level_id: "A1", sort_order: 0 } },
    { id: "u1l2", sort_order: 1, units: { level_id: "A1", sort_order: 0 } },
    { id: "u2l1", sort_order: 0, units: { level_id: "A2", sort_order: 1 } },
    { id: "u3l1", sort_order: 0, units: { level_id: "A1", sort_order: 2 } },
  ];
  const result = (table: string) => {
    if (table === "lessons") return { data: lessons, error: null };
    if (table === "lesson_completions") {
      return opts.failCompletions
        ? { data: null, error: { message: "boom" } }
        : { data: opts.done.map((lesson_id) => ({ lesson_id })), error: null };
    }
    return { data: opts.level ? { cefr_level: opts.level } : null, error: null };
  };
  return {
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order"]) q[m] = () => q;
      q.range = () => Promise.resolve(result(table));
      q.maybeSingle = () => Promise.resolve(result(table));
      q.then = (f: (v: unknown) => unknown) => Promise.resolve(result(table)).then(f);
      return q;
    },
  } as unknown as SupabaseClient;
}

Deno.test(
  "lessonStartVerdict: the shared rule over a real read, in LEARNING order (bands grouped)",
  async () => {
    const v = (done: string[], level: string | null, id: string) =>
      lessonStartVerdict(verdictDb({ done, level }), USER, "en", id);
    // A fresh learner: only the first lesson. The array-order neighbour u2l1 (A2) is NOT next; u3l1 (A1) is after u1l2.
    assertEquals(await v([], null, "u1l1"), "unlocked");
    assertEquals(await v([], "A1", "u1l2"), "locked");
    assertEquals(await v([], "A1", "u2l1"), "locked");
    // After u1l1 the next in learning order is u1l2.
    assertEquals(await v(["u1l1"], "A1", "u1l2"), "unlocked");
    assertEquals(await v(["u1l1"], "A1", "u3l1"), "locked");
    // Placement at A2: the first A2 lesson opens, and so do the A1 lessons before it.
    assertEquals(await v([], "A2", "u2l1"), "unlocked");
    assertEquals(await v([], "A2", "u3l1"), "unlocked");
    // Out-of-order history (u1l2 done, u1l1 not): the next after the furthest stays open, and the skipped one.
    assertEquals(await v(["u1l2"], "A1", "u3l1"), "unlocked");
    assertEquals(await v(["u1l2"], "A1", "u1l1"), "unlocked");
    // What the installed apps call "where you are" (first undone in curriculum order, here the A2 u2l1) stays open too.
    assertEquals(await v(["u1l1", "u1l2"], "A1", "u2l1"), "unlocked");
    // A replay of a finished lesson.
    assertEquals(await v(["u1l1", "u1l2", "u3l1"], "A1", "u1l1"), "unlocked");
  },
);

Deno.test("lessonStartVerdict: a failed read is unknown, never locked", async () => {
  const db = verdictDb({ done: [], level: null, failCompletions: true });
  assertEquals(await lessonStartVerdict(db, USER, "en", "u3l1"), "unknown");
});
