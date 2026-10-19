// Drives the real complete-lesson handler with fake dependencies: no network, no database, no secrets.
// Run: deno test supabase/functions/complete-lesson/handler.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type CompleteLessonDeps, createCompleteLessonHandler } from "./handler.ts";
import { computeXpGain } from "./progress-math.ts";

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "in" | "gt" | "lte"; col: string; val: unknown };

/** The subset of supabase-js the handler uses, over in-memory tables. */
class FakeDb {
  tables: Record<string, Row[]> = {};
  failReads = new Set<string>();
  rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  upserts: { table: string; rows: Row[] }[] = [];
  rpcResult: { data: unknown; error: unknown } = { data: { status: "applied" }, error: null };
  lesson: (Row & { id: string; course: string }) | null = null;

  from(table: string) {
    return new Query(this, table);
  }
  rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    // Like the real apply_lesson_completion: an applied save writes the completion row the later reads see.
    if (name === "apply_lesson_completion" && (this.rpcResult.data as Row | null)?.status === "applied") {
      const next = args._next as Row;
      const rows = (this.tables.lesson_completions ?? []).filter((r) => r.lesson_id !== args._lesson_id);
      rows.push({
        user_id: args._user_id, lesson_id: args._lesson_id, language: args._course,
        correct: next.best_correct, total: next.total, xp_earned: next.best_xp,
      });
      this.tables.lesson_completions = rows;
    }
    return Promise.resolve(this.rpcResult);
  }
  client() {
    return this as unknown as SupabaseClient;
  }
}

class Query {
  private filters: Filter[] = [];
  private countHead = false;
  constructor(private db: FakeDb, private table: string) {}
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    this.countHead = !!opts?.head;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ op: "eq", col, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ op: "in", col, val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ op: "gt", col, val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ op: "lte", col, val });
    return this;
  }
  upsert(rows: Row[], _opts?: unknown) {
    this.db.upserts.push({ table: this.table, rows });
    return Promise.resolve({ data: null, error: null });
  }
  private rows(): Row[] {
    return (this.db.tables[this.table] ?? []).filter((r) =>
      this.filters.every((f) => {
        const v = r[f.col];
        if (f.op === "eq") return v === f.val;
        if (f.op === "in") return (f.val as unknown[]).includes(v);
        if (f.op === "gt") return (v as number) > (f.val as number);
        return (v as number) <= (f.val as number);
      })
    );
  }
  private result() {
    if (this.db.failReads.has(this.table)) return { data: null, error: { message: "read failed" }, count: null };
    if (this.table === "lessons") {
      // The handler scopes the lesson to the claimed course through the units join ("units.course").
      const l = this.db.lesson;
      const match = l && this.filters.every((f) =>
        f.col === "id" ? f.val === l.id : f.col === "units.course" ? f.val === l.course : false
      );
      return { data: match ? l : null, error: null, count: null };
    }
    const rows = this.rows();
    return this.countHead ? { data: null, error: null, count: rows.length } : { data: rows, error: null, count: rows.length };
  }
  maybeSingle() {
    const r = this.result();
    return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error });
  }
  then<T>(resolve: (v: ReturnType<Query["result"]>) => T, reject?: (e: unknown) => T) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }
}

const USER = "user-1";
const QUESTIONS = [
  { id: "q1", type: "mc", prompt: "p1", choices: ["a", "b"], bank: null, answer_index: 0, answer_text: null },
  { id: "q2", type: "mc", prompt: "p2", choices: ["c", "d"], bank: null, answer_index: 1, answer_text: null },
];
const NOW = new Date("2026-10-17T12:00:00Z");

function setup(opts: { tokenOk?: boolean; auth?: Response; pushFails?: boolean; consent?: boolean } = {}) {
  const db = new FakeDb();
  db.lesson = { id: "u1l1", course: "fr", units: { level_id: "A2" }, questions: QUESTIONS };
  db.tables.achievements = [{ id: "first_lesson", category: "lessons", threshold: 1 }];
  const pushes: string[] = [];
  const tokenClaims: Row[] = [];
  const consentReads: string[] = [];
  const deps: CompleteLessonDeps = {
    authenticate: () => Promise.resolve(opts.auth ?? { userId: USER, userClient: db.client() }),
    admin: () => db.client(),
    translateQuotaCheck: () => () => Promise.resolve(true),
    hasAiConsent: (_admin, userId) => {
      consentReads.push(userId);
      return Promise.resolve(opts.consent ?? true);
    },
    verifySessionToken: (_token, claim) => {
      tokenClaims.push(claim as unknown as Row);
      return opts.tokenOk ?? true;
    },
    sendPush: (_admin, userId) => {
      pushes.push(userId);
      // The real sendPushToUser fails asynchronously, so the fake rejects rather than throws.
      if (opts.pushFails) return Promise.reject(new Error("push down"));
      return Promise.resolve({ sent: 1, skipped: null });
    },
    now: () => NOW,
  };
  return { db, pushes, tokenClaims, consentReads, handler: createCompleteLessonHandler(deps) };
}

function post(body: unknown, method = "POST") {
  return new Request("http://local/complete-lesson", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

const body = (answers: string[], total = 2) => ({
  lessonId: "u1l1",
  total,
  answers: answers.map((answer, i) => ({ questionId: `q${i + 1}`, answer })),
  course: "fr",
  sessionToken: "tok",
});

Deno.test("rejects a non-POST, an unauthenticated call and a malformed body before touching data", async () => {
  const { db, handler } = setup();
  assertEquals((await handler(post(null, "GET"))).status, 405);
  const denied = setup({ auth: new Response("{}", { status: 401 }) });
  assertEquals((await denied.handler(post(body(["a", "d"])))).status, 401);
  assertEquals(denied.db.rpcCalls.length, 0);
  const malformed = await handler(post({ lessonId: "u1l1" }));
  assertEquals(malformed.status, 400);
  assertEquals(await malformed.json(), { error: "Invalid request body" });
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("a payload that no longer matches the lesson is a 409 lesson-version-mismatch", async () => {
  const { db, handler } = setup();
  const res = await handler(post(body(["a"], 1)));
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error, "lesson-version-mismatch");
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("an invalid lesson session token is a 403 and saves nothing", async () => {
  const { db, handler, tokenClaims } = setup({ tokenOk: false });
  assertEquals((await handler(post(body(["a", "d"])))).status, 403);
  assertEquals(db.rpcCalls.length, 0);
  // The token is checked against this user, this lesson and this course, never the client's say-so.
  assertEquals(tokenClaims, [{ userId: USER, lessonId: "u1l1", course: "fr" }]);
});

Deno.test("another course's lesson id is a 409 and saves nothing", async () => {
  const { db, handler } = setup();
  const res = await handler(post({ ...body(["a", "d"]), course: "es" }));
  assertEquals(res.status, 409);
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("a perfect first completion is saved in one transaction with server-derived results", async () => {
  const { db, handler } = setup();
  const res = await handler(post(body(["a", "d"])));
  assertEquals(res.status, 200);
  const json = await res.json();
  const xp = computeXpGain(2, 2);
  assertEquals(json.xpGain, xp);
  assertEquals(json.progress.xp, xp);
  assertEquals(json.progress.streak, 1);
  assertEquals(json.progress.lastActiveDate, "2026-10-17");
  assertEquals(json.heartsBonus, null); // full hearts: no perfect-lesson heart to give
  assertEquals(json.newlyUnlocked, ["first_lesson"]);

  assertEquals(db.rpcCalls.length, 1);
  const { name, args } = db.rpcCalls[0];
  assertEquals(name, "apply_lesson_completion");
  assertEquals(args._user_id, USER);
  assertEquals(args._course, "fr");
  assertEquals(args._level, "A2");
  assertEquals(args._today, "2026-10-17");
  assertEquals(args._missed_question_ids, []);
  assertEquals((args._next as Row).day_xp, xp);
  assertEquals((args._expected as Row).completion_xp, null);
  assertEquals(
    (args._activity_events as Row[]).map((e) => e.event_type),
    ["lesson_completed"],
  );
  assertEquals(db.upserts.map((u) => u.table), ["user_achievements"]);
});

Deno.test("the server re-grades answers: a wrong answer is missed whatever the client thinks", async () => {
  const { db, handler } = setup();
  const res = await handler(post(body(["a", "c"])));
  assertEquals(res.status, 200);
  assertEquals(db.rpcCalls[0].args._missed_question_ids, ["q2"]);
  assertEquals((await res.json()).xpGain, computeXpGain(1, 2));
});

Deno.test("a replay pays only the improvement over the best earlier score", async () => {
  const { db, handler } = setup();
  db.tables.lesson_completions = [{ user_id: USER, lesson_id: "u1l1", language: "fr", correct: 1, xp_earned: computeXpGain(1, 2), total: 2 }];
  const res = await handler(post(body(["a", "d"])));
  const json = await res.json();
  assertEquals(json.xpGain, computeXpGain(2, 2) - computeXpGain(1, 2));
  assertEquals((db.rpcCalls[0].args._expected as Row).completion_xp, computeXpGain(1, 2));
});

Deno.test("a perfect lesson below full hearts earns one heart", async () => {
  const { handler, db } = setup();
  db.tables.user_progress = [{
    user_id: USER, streak: 0, longest_streak: 0, last_active_date: null, hearts: 3,
    hearts_refill_at: null, streak_freezes: 0, updated_at: "t0",
  }];
  const json = await (await handler(post(body(["a", "d"])))).json();
  assertEquals(json.heartsBonus, "perfect");
  assertEquals(json.progress.hearts, 4);
  assertEquals((db.rpcCalls[0].args._expected as Row).p_updated_at, "t0");
});

Deno.test("a failed progress read is a retryable 503 and nothing is written", async () => {
  const { db, handler } = setup();
  db.failReads.add("user_progress");
  const res = await handler(post(body(["a", "d"])));
  assertEquals(res.status, 503);
  assertEquals(db.rpcCalls.length, 0);
  assertEquals(db.upserts.length, 0);
});

Deno.test("a stale snapshot (transaction not applied) is a retryable 503", async () => {
  const { db, handler } = setup();
  db.rpcResult = { data: { status: "conflict" }, error: null };
  const res = await handler(post(body(["a", "d"])));
  assertEquals(res.status, 503);
  assertEquals(db.upserts.length, 0);
});

Deno.test("after a save, a failed unlock read skips achievements instead of rewriting them", async () => {
  const { db, handler } = setup();
  db.failReads.add("user_achievements");
  const res = await handler(post(body(["a", "d"])));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).newlyUnlocked, []);
  assertEquals(db.upserts.length, 0);
});

Deno.test("the promotion count is the larger of the stored counter and the saved promotion events", async () => {
  const { db, handler } = setup();
  db.tables.achievements = [{ id: "league_promote_3", category: "league", threshold: 3 }];
  db.tables.user_achievements = [];
  db.tables.friend_activity_events = [1, 2, 3].map((i) => ({ id: i, user_id: USER, event_type: "league_promotion" }));
  const json = await (await handler(post(body(["a", "d"])))).json();
  assertEquals(json.newlyUnlocked, ["league_promote_3"]);
  const row = db.upserts[0].rows[0];
  assertEquals(row.progress, 3);
});

Deno.test("a friend passed on the leaderboard gets an overtake push; a push failure never fails the save", async () => {
  const { db, handler, pushes } = setup();
  db.tables.friendships = [{ user_id: USER, friend_id: "friend-1", status: "accepted" }];
  db.tables.language_progress = [{ user_id: "friend-1", language: "fr", xp: 1 }];
  const res = await handler(post(body(["a", "d"])));
  assertEquals(res.status, 200);
  assertEquals(pushes, ["friend-1"]);
  assert(db.rpcCalls.length === 1);

  const failing = setup({ pushFails: true });
  failing.db.tables.friendships = db.tables.friendships;
  failing.db.tables.language_progress = db.tables.language_progress;
  const saved = await failing.handler(post(body(["a", "d"])));
  assertEquals(saved.status, 200);
  assertEquals(failing.pushes, ["friend-1"]);
});

Deno.test("a stored promotion counter larger than the saved events is kept", async () => {
  const { db, handler } = setup();
  db.tables.achievements = [{ id: "league_promote_3", category: "league", threshold: 3 }];
  db.tables.user_achievements = [{ user_id: USER, achievement_id: "league_promote_3", progress: 5 }];
  db.tables.friend_activity_events = [{ id: 1, user_id: USER, event_type: "league_promotion" }];
  await handler(post(body(["a", "d"])));
  assertEquals(db.upserts[0].rows[0].progress, 5);
});

Deno.test("hearts refill against the injected clock, not the machine clock", async () => {
  const { db, handler } = setup();
  // Due one minute before the handler's 'now'; a real clock in 2026-10 or later would also see it due, so
  // also check the not-yet-due case one minute after.
  db.tables.user_progress = [{
    user_id: USER, streak: 0, longest_streak: 0, last_active_date: null, hearts: 0,
    hearts_refill_at: new Date(NOW.getTime() - 60_000).toISOString(), streak_freezes: 0, updated_at: "t0",
  }];
  assertEquals((await (await handler(post(body(["a", "c"])))).json()).progress.hearts, 5);

  const later = setup();
  later.db.tables.user_progress = [{
    user_id: USER, streak: 0, longest_streak: 0, last_active_date: null, hearts: 0,
    hearts_refill_at: new Date(NOW.getTime() + 60_000).toISOString(), streak_freezes: 0, updated_at: "t0",
  }];
  assertEquals((await (await later.handler(post(body(["a", "c"])))).json()).progress.hearts, 0);
});

Deno.test("a translate answer outside the curated list asks for AI consent, and without it counts as missed", async () => {
  const { db, handler, consentReads } = setup({ consent: false });
  db.lesson = {
    id: "u1l1", course: "fr", units: { level_id: "A2" },
    questions: [
      QUESTIONS[0],
      { id: "q2", type: "translate", prompt: "p2", choices: null, bank: ["the cat"], answer_index: null, answer_text: "the cat" },
    ],
  };
  const res = await handler(post(body(["a", "a feline"])));
  assertEquals(res.status, 200);
  assertEquals(consentReads, [USER]);
  assertEquals(db.rpcCalls[0].args._missed_question_ids, ["q2"]);
});

Deno.test("only friends actually passed get an overtake push", async () => {
  const { db, handler, pushes } = setup();
  const xp = computeXpGain(2, 2);
  db.tables.friendships = ["ahead", "passed", "behind"].map((f) => ({ user_id: USER, friend_id: f, status: "accepted" }));
  db.tables.language_progress = [
    { user_id: "ahead", language: "fr", xp: xp + 1 },
    { user_id: "passed", language: "fr", xp: 1 },
    { user_id: "behind", language: "fr", xp: 0 },
  ];
  await handler(post(body(["a", "d"])));
  assertEquals(pushes, ["passed"]);
});
