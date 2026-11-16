// Run with `deno test supabase/functions/_shared/ai-cost-log.test.ts`.
import { assertEquals } from "jsr:@std/assert@1";
import { costRowFromReply, makeTranslateCostLogger } from "./ai-cost-log.ts";

Deno.test("uses the provider's charge, and the fee plus the host's charge under BYOK", () => {
  const plain = costRowFromReply("u", "translate", "m", {
    model: "anthropic/claude-haiku-5.5",
    usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0002 },
  });
  assertEquals(plain?.cost_micro_usd, 200);
  assertEquals(plain?.cost_source, "provider");
  const byok = costRowFromReply("u", "translate", "m", {
    usage: { cost: 0.00001, is_byok: true, cost_details: { upstream_inference_cost: 0.00015 } },
  });
  assertEquals(byok?.cost_micro_usd, 160);
});

Deno.test("a reply with no reported cost is logged unknown with a null cost, never zero", () => {
  const row = costRowFromReply("u", "translate", "req/model", { usage: { prompt_tokens: 3 } });
  assertEquals(row?.cost_micro_usd, null);
  assertEquals(row?.cost_source, "unknown");
  assertEquals(row?.model, "req/model");
  assertEquals(costRowFromReply("u", "translate", "m", "nope"), null);
});

Deno.test("the logger never throws, whatever the database does", async () => {
  const throwing = {
    from: () => {
      throw new Error("down");
    },
  };
  await makeTranslateCostLogger(throwing as never, "u")({ usage: {} }, "m");
  const erroring = { from: () => ({ insert: () => Promise.resolve({ error: { message: "x" } }) }) };
  await makeTranslateCostLogger(erroring as never, "u")({ usage: {} }, "m");
});

import { settleUsage } from "./translation-grader.ts";

Deno.test(
  "the cost write is handed to waitUntil when the platform has it, and not awaited",
  async () => {
    let handed: Promise<unknown> | undefined;
    let finished = false;
    await settleUsage(
      async () => {
        await new Promise((r) => setTimeout(r, 20));
        finished = true;
      },
      { waitUntil: (p) => (handed = p) },
    );
    assertEquals(handed !== undefined, true);
    assertEquals(finished, false);
    await handed;
    assertEquals(finished, true);
  },
);

Deno.test(
  "without waitUntil the write is awaited, bounded by the timeout, and never throws",
  async () => {
    let done = false;
    await settleUsage(async () => {
      await new Promise((r) => setTimeout(r, 10));
      done = true;
    }, undefined);
    assertEquals(done, true);
    const t0 = Date.now();
    await settleUsage(() => new Promise<void>(() => {}), undefined, 30);
    assertEquals(Date.now() - t0 < 1000, true);
    await settleUsage(() => {
      throw new Error("boom");
    }, undefined);
    await settleUsage(() => Promise.reject(new Error("boom")), { waitUntil: () => {} });
  },
);
