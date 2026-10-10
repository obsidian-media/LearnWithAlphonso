import { assertEquals } from "jsr:@std/assert@1";
import { hasAiConsent } from "./ai-consent.ts";

function fakeAdmin(result: { data: unknown; error: { message: string } | null }, calls: string[] = []) {
  return {
    from: (table: string) => {
      calls.push(table);
      const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve(result) };
      return q;
    },
  };
}

Deno.test("consent is true only with a stored timestamp", async () => {
  assertEquals(await hasAiConsent(fakeAdmin({ data: { ai_consent_at: "2026-10-09T10:00:00Z" }, error: null }), "u"), true);
  assertEquals(await hasAiConsent(fakeAdmin({ data: { ai_consent_at: null }, error: null }), "u"), false);
  assertEquals(await hasAiConsent(fakeAdmin({ data: null, error: null }), "u"), false);
});

Deno.test("a failed read means no AI (grading stays local)", async () => {
  assertEquals(await hasAiConsent(fakeAdmin({ data: null, error: { message: "boom" } }), "u"), false);
});

Deno.test("ENFORCE_AI_CONSENT=false cannot bypass stored consent", async () => {
  Deno.env.set("ENFORCE_AI_CONSENT", "false");
  const calls: string[] = [];
  try {
    assertEquals(await hasAiConsent(fakeAdmin({ data: null, error: null }, calls), "u"), false);
    assertEquals(calls, ["profiles"]);
  } finally {
    Deno.env.delete("ENFORCE_AI_CONSENT");
  }
});
