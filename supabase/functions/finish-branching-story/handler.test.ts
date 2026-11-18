// Drives the real finish-branching-story handler with fake dependencies: no network, no database, no secrets.
// Run: deno test supabase/functions/finish-branching-story/handler.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFinishBranchingStoryHandler } from "./handler.ts";

const STORY = "22222222-2222-4222-8222-222222222222";

function setup(rpcResult: { data: unknown; error: unknown }, authed = true) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const handler = createFinishBranchingStoryHandler({
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
const valid = { storyId: STORY, path: [0, 1] };

Deno.test("a signed-in finish is decided by the database as the verified user", async () => {
  const applied = {
    status: "applied",
    endingId: "kind-and-on-time",
    quality: "good",
    endingsFound: ["kind-and-on-time"],
    endingsTotal: 4,
    credited: true,
  };
  const { handler, calls } = setup({ data: applied, error: null });
  const res = await handler(post(valid));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), applied);
  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.name, "finish_branching_story");
  assertEquals(calls[0]!.args._user_id, "user-1");
  assertEquals(calls[0]!.args._story_id, STORY);
  assertEquals(calls[0]!.args._path, [0, 1]);
});

Deno.test(
  "a client-claimed ending, credit or user id is ignored: only the path reaches the database",
  async () => {
    const { handler, calls } = setup({ data: { status: "applied" }, error: null });
    await handler(
      post({
        ...valid,
        endingId: "kind-and-on-time",
        quality: "good",
        credited: true,
        userId: "someone-else",
        _user_id: "someone-else",
      }),
    );
    assertEquals(calls[0]!.args._user_id, "user-1");
    assertEquals(Object.keys(calls[0]!.args).sort(), ["_path", "_story_id", "_user_id"]);
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

Deno.test("a path with no choices at all is a valid straight-through story", async () => {
  const { handler, calls } = setup({ data: { status: "applied" }, error: null });
  assertEquals((await handler(post({ storyId: STORY, path: [] }))).status, 200);
  assertEquals(calls[0]!.args._path, []);
});

Deno.test("a malformed body is a 400 and costs no database call", async () => {
  const { handler, calls } = setup({ data: { status: "applied" }, error: null });
  const bad = [
    {},
    { storyId: "not-a-uuid", path: [0] },
    { storyId: STORY },
    { storyId: STORY, path: [-1] },
    { storyId: STORY, path: [1.5] },
    { storyId: STORY, path: ["0"] },
    { storyId: STORY, path: new Array(31).fill(0) },
  ];
  for (const body of bad) assertEquals((await handler(post(body))).status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("the database refusals map to the stable codes the apps read", async () => {
  const cases: [string, number, string][] = [
    ["not-found", 404, "not-found"],
    ["invalid", 400, "invalid-path"],
    ["something-else", 503, "Could not save the path; retry"],
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
