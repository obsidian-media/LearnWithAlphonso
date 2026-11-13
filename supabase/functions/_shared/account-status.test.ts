import { assertEquals } from "jsr:@std/assert@1";
import { ACCOUNT_SUSPENDED_ERROR, isBanned, suspendedResponse } from "./account-status.ts";

function fakeAdmin(result: { data: unknown; error: { message: string } | null }, calls: unknown[] = []) {
  return {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      return Promise.resolve(result);
    },
  };
}

Deno.test("a banned learner is detected through is_restricted(user, 'ban')", async () => {
  const calls: unknown[] = [];
  assertEquals(await isBanned(fakeAdmin({ data: true, error: null }, calls), "u1"), true);
  assertEquals(calls, [["is_restricted", { p_user: "u1", p_kind: "ban" }]]);
});

Deno.test("anyone else is not banned", async () => {
  assertEquals(await isBanned(fakeAdmin({ data: false, error: null }), "u1"), false);
  assertEquals(await isBanned(fakeAdmin({ data: null, error: null }), "u1"), false);
});

Deno.test("a failed check does not lock every learner out", async () => {
  assertEquals(await isBanned(fakeAdmin({ data: null, error: { message: "down" } }), "u1"), false);
});

Deno.test("the refusal is a 403 whose error is account_suspended", async () => {
  const res = suspendedResponse();
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, ACCOUNT_SUSPENDED_ERROR);
  assertEquals(ACCOUNT_SUSPENDED_ERROR, "account_suspended");
});
