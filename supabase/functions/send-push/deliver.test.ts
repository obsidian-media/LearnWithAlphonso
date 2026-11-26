// Run with `deno test supabase/functions/send-push/deliver.test.ts` (inside the function directory in CI).
import { assertEquals } from "jsr:@std/assert@1";
import { deliverPush } from "./deliver.ts";

type Row = { event: string; source: string; user_id: string | null; detail: Record<string, unknown> };

function fakeAdmin(rows: Row[], failWrite = false) {
  return {
    from: (table: string) => ({
      insert: (row: Row) => {
        if (table === "ops_events") rows.push(row);
        return Promise.resolve({ error: failWrite ? { message: "down" } : null });
      },
    }),
  };
}

Deno.test("a push that failed on some devices leaves one ops_events row with counts only", async () => {
  const rows: Row[] = [];
  const result = await deliverPush(
    async () => ({ sent: 1, failed: 2, skipped: null }),
    fakeAdmin(rows),
    "user-1",
    "Nudged",
    "A friend nudged you",
    {},
  );
  assertEquals(result, { sent: 1, failed: 2, skipped: null });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].event, "push_send_failed");
  assertEquals(rows[0].source, "send-push");
  assertEquals(rows[0].user_id, "user-1");
  assertEquals(rows[0].detail, { failed: 2, sent: 1 });
});

Deno.test("nothing is recorded when every send worked, was skipped, or had no device", async () => {
  const rows: Row[] = [];
  for (const r of [
    { sent: 2, failed: 0, skipped: null },
    { sent: 0, failed: 0, skipped: "not_configured" as const },
    { sent: 0, failed: 0, skipped: null },
  ]) {
    await deliverPush(async () => r, fakeAdmin(rows), "user-1", "t", "b", {});
  }
  assertEquals(rows.length, 0);
});

Deno.test("a failure to record never fails the send", async () => {
  const rows: Row[] = [];
  const result = await deliverPush(
    async () => ({ sent: 0, failed: 1, skipped: null }),
    fakeAdmin(rows, true),
    "user-1",
    "t",
    "b",
    {},
  );
  assertEquals(result.failed, 1);
});
