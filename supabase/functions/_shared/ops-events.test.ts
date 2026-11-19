import { assert, assertEquals } from "jsr:@std/assert@1";
import { recordOpsEvent } from "./ops-events.ts";

type Row = Record<string, unknown>;
const client = (insert: (row: Row) => PromiseLike<{ error: { message: string } | null }>) => ({
  from: (_t: string) => ({ insert }),
});

Deno.test("writes one ops_events row with the source, user and detail", async () => {
  const rows: Row[] = [];
  const admin = client((r) => {
    rows.push(r);
    return Promise.resolve({ error: null });
  });
  await recordOpsEvent(admin, "edge:x", "hearts_settlement_failed", { reason: "rpc" }, "u1");
  assertEquals(rows, [
    {
      event: "hearts_settlement_failed",
      source: "edge:x",
      user_id: "u1",
      detail: { reason: "rpc" },
    },
  ]);
});

Deno.test(
  "never throws: an error result, a throw and a bad event name are all swallowed",
  async () => {
    await recordOpsEvent(
      client(() => Promise.resolve({ error: { message: "no" } })),
      "s",
      "e",
    );
    await recordOpsEvent(
      client(() => {
        throw new Error("boom");
      }),
      "s",
      "e",
    );
    await recordOpsEvent(
      client(() => Promise.reject(new Error("rejected"))),
      "s",
      "e",
    );
    let called = false;
    await recordOpsEvent(
      client(() => {
        called = true;
        return Promise.resolve({ error: null });
      }),
      "s",
      "Bad Name!",
    );
    assert(!called);
  },
);

Deno.test("never blocks: a hanging write is abandoned at the timeout", async () => {
  const t0 = Date.now();
  await recordOpsEvent(
    client(() => new Promise(() => {})),
    "s",
    "e",
    {},
    null,
    50,
  );
  assert(Date.now() - t0 < 1000);
});
