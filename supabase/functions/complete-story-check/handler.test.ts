// Drives the real complete-story-check handler with fake dependencies: no network, no database, no secrets.
// Run: deno test supabase/functions/complete-story-check/handler.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCompleteStoryCheckHandler } from "./handler.ts";

const STORY = "22222222-2222-4222-8222-222222222222";

function setup(rpcResult: { data: unknown; error: unknown }, authed = true) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const handler = createCompleteStoryCheckHandler({
    authenticate: async () => (authed ? { userId: "user-1" } : new Response("{}", { status: 401 })),
    admin: () =>
      ({
        rpc: (name: string, args: Record<string, unknown>) => {
          calls.push({ name, args });
          return Promise.resolve(rpcResult);
        },
      }) as unknown as SupabaseClient,
  });
  return { handler, calls };
}
const post = (body: unknown, method = "POST") =>
  new Request("https://x.test/", {
    method,
    body: method === "POST" ? JSON.stringify(body) : undefined,
    headers: { authorization: "Bearer a.b.c" },
  });
const valid = { storyId: STORY, answers: [{ questionId: "q1", choiceIndex: 2 }] };

Deno.test("a signed-in submission is graded by the database as the verified user", async () => {
  const applied = {
    status: "applied",
    correct: 2,
    total: 3,
    bestCorrect: 2,
    missedQuestionIds: ["q3"],
  };
  const { handler, calls } = setup({ data: applied, error: null });
  const res = await handler(post(valid));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), applied);
  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.name, "submit_story_check");
  assertEquals(calls[0]!.args._user_id, "user-1");
  assertEquals(calls[0]!.args._story_id, STORY);
  assertEquals(calls[0]!.args._answers, valid.answers);
});

Deno.test(
  "a client-claimed score or user id is ignored: only the answers reach the database",
  async () => {
    const { handler, calls } = setup({ data: { status: "applied" }, error: null });
    await handler(post({ ...valid, correct: 3, userId: "someone-else", _user_id: "someone-else" }));
    assertEquals(calls[0]!.args._user_id, "user-1");
    assertEquals(Object.keys(calls[0]!.args).sort(), ["_answers", "_story_id", "_user_id"]);
  },
);

Deno.test("an unauthenticated request never reaches the database", async () => {
  const { handler, calls } = setup({ data: { status: "applied" }, error: null }, false);
  const res = await handler(post(valid));
  assertEquals(res.status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("only POST is accepted", async () => {
  const { handler, calls } = setup({ data: { status: "applied" }, error: null });
  assertEquals((await handler(post(valid, "GET"))).status, 405);
  assertEquals(calls.length, 0);
});

Deno.test("a malformed body is a 400 and costs no database call", async () => {
  const { handler, calls } = setup({ data: { status: "applied" }, error: null });
  const bad = [
    {},
    { storyId: "not-a-uuid", answers: valid.answers },
    { storyId: STORY, answers: [] },
    { storyId: STORY, answers: [{ questionId: "q1", choiceIndex: 4 }] },
    { storyId: STORY, answers: [{ questionId: "one", choiceIndex: 1 }] },
  ];
  for (const body of bad) assertEquals((await handler(post(body))).status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("the database refusals map to the stable codes the apps read", async () => {
  const cases: [string, number, string][] = [
    ["not-found", 404, "not-found"],
    ["invalid", 400, "invalid-answers"],
    ["something-else", 503, "Could not save the check; retry"],
  ];
  for (const [status, http, error] of cases) {
    const { handler } = setup({ data: { status }, error: null });
    const res = await handler(post(valid));
    assertEquals(res.status, http, status);
    assertEquals((await res.json()).error, error, status);
  }
});

Deno.test("a database error is retryable and records nothing", async () => {
  const { handler } = setup({ data: null, error: { message: "boom" } });
  const res = await handler(post(valid));
  assertEquals(res.status, 503);
});
