// Drives the real complete-podcast-quiz handler with fake dependencies: no network, no database, no secrets.
// Run: deno test supabase/functions/complete-podcast-quiz/handler.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCompletePodcastQuizHandler, HOURLY_COMPLETION_LIMIT } from "./handler.ts";
import { HOURLY_COMPLETION_LIMIT as LESSON_LIMIT } from "../complete-lesson/anti-farming.ts";

const EPISODE = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-04T12:00:00Z");

function setup(rpcResult: { data: unknown; error: unknown }, authed = true) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const handler = createCompletePodcastQuizHandler({
    authenticate: async () => (authed ? { userId: "user-1" } : new Response("{}", { status: 401 })),
    admin: () =>
      ({
        rpc: (name: string, args: Record<string, unknown>) => {
          calls.push({ name, args });
          return Promise.resolve(rpcResult);
        },
      }) as unknown as SupabaseClient,
    now: () => NOW,
  });
  return { handler, calls };
}
const post = (body: unknown) =>
  new Request("https://x.test/", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { authorization: "Bearer a.b.c" },
  });
const valid = { episodeId: EPISODE, answers: [{ questionId: "q1", choiceIndex: 2 }] };

Deno.test(
  "a signed-in submission is graded by the database, as the authenticated user, with the shared ceiling",
  async () => {
    const { handler, calls } = setup({
      data: { status: "applied", correct: 5, xpGain: 50 },
      error: null,
    });
    const res = await handler(post(valid));
    assertEquals(res.status, 200);
    assertEquals((await res.json()).xpGain, 50);
    assertEquals(calls.length, 1);
    assertEquals(calls[0]!.name, "submit_podcast_quiz");
    assertEquals(calls[0]!.args._user_id, "user-1");
    assertEquals(calls[0]!.args._limit, HOURLY_COMPLETION_LIMIT);
    assertEquals(calls[0]!.args._completed_at, null);
    assertEquals(calls[0]!.args._answers, valid.answers);
  },
);

Deno.test(
  "a client-claimed score or user id is ignored: only the answers reach the database",
  async () => {
    const { handler, calls } = setup({ data: { status: "applied" }, error: null });
    await handler(post({ ...valid, correct: 7, xp: 9999, userId: "someone-else" }));
    assertEquals(calls[0]!.args._user_id, "user-1");
    assertEquals(Object.keys(calls[0]!.args).sort(), [
      "_answers",
      "_at",
      "_completed_at",
      "_episode_id",
      "_limit",
      "_user_id",
    ]);
  },
);

Deno.test("unauthenticated requests never reach the database", async () => {
  const { handler, calls } = setup({ data: { status: "applied" }, error: null }, false);
  assertEquals((await handler(post(valid))).status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("malformed bodies are 400 and never reach the database", async () => {
  const { handler, calls } = setup({ data: { status: "applied" }, error: null });
  const bad = [
    {},
    { episodeId: "nope", answers: valid.answers },
    { episodeId: EPISODE, answers: [] },
    { episodeId: EPISODE, answers: [{ questionId: "q1", choiceIndex: 4 }] },
    { episodeId: EPISODE, answers: [{ questionId: "q1", choiceIndex: "2" }] },
  ];
  for (const body of bad) assertEquals((await handler(post(body))).status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("only POST is allowed", async () => {
  const { handler } = setup({ data: { status: "applied" }, error: null });
  assertEquals((await handler(new Request("https://x.test/", { method: "GET" }))).status, 405);
});

Deno.test("the database's refusals map to stable statuses", async () => {
  const cases: [string, number, string][] = [
    ["not-found", 404, "not-found"],
    ["invalid", 400, "invalid-answers"],
    ["rate-limited", 429, "rate-limited"],
  ];
  for (const [status, http, code] of cases) {
    const { handler } = setup({ data: { status }, error: null });
    const res = await handler(post(valid));
    assertEquals(res.status, http);
    assertEquals((await res.json()).error, code);
  }
});

Deno.test("a database error is a retryable 503, never a silent success", async () => {
  const { handler } = setup({ data: null, error: { message: "boom" } });
  assertEquals((await handler(post(valid))).status, 503);
});

Deno.test("the quiz shares the lesson hourly ceiling value", () => {
  assertEquals(HOURLY_COMPLETION_LIMIT, LESSON_LIMIT);
});

Deno.test(
  "the client's finish time is passed on for the database to clamp, never turned into a day here",
  async () => {
    const { handler, calls } = setup({ data: { status: "applied" }, error: null });
    await handler(post({ ...valid, completedAt: "2026-11-05T01:30:00+14:00" }));
    assertEquals(calls[0]!.args._completed_at, "2026-11-05T01:30:00+14:00");
    assertEquals("_today" in calls[0]!.args, false);
  },
);

Deno.test("a malformed finish time is a 400", async () => {
  const { handler, calls } = setup({ data: { status: "applied" }, error: null });
  assertEquals((await handler(post({ ...valid, completedAt: "yesterday" }))).status, 400);
  assertEquals(calls.length, 0);
});
