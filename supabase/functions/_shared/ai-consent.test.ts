import { assertEquals } from "jsr:@std/assert@1";
import { hasAiConsent, isAiSwitchedOn } from "./ai-consent.ts";

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
    assertEquals(calls, ["app_switches", "profiles"]);
  } finally {
    Deno.env.delete("ENFORCE_AI_CONSENT");
  }
});

/** Answers per table: the switch read and the consent read are different rows. */
function tables(byTable: Record<string, { data: unknown; error: { message: string } | null }>) {
  return {
    from: (table: string) => {
      const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve(byTable[table]) };
      return q;
    },
  };
}
const consented = { data: { ai_consent_at: "2026-10-09T10:00:00Z" }, error: null };

Deno.test("the AI switch is on unless stored as off, and a failed read counts as on", async () => {
  assertEquals(await isAiSwitchedOn(tables({ app_switches: { data: { enabled: true }, error: null } })), true);
  assertEquals(await isAiSwitchedOn(tables({ app_switches: { data: null, error: null } })), true);
  assertEquals(await isAiSwitchedOn(tables({ app_switches: { data: { enabled: false }, error: null } })), false);
  assertEquals(await isAiSwitchedOn(tables({ app_switches: { data: null, error: { message: "down" } } })), true);
});

Deno.test("with the AI switch off a consented learner is graded locally", async () => {
  const off = tables({ app_switches: { data: { enabled: false }, error: null }, profiles: consented });
  assertEquals(await hasAiConsent(off, "u"), false);
  const on = tables({ app_switches: { data: { enabled: true }, error: null }, profiles: consented });
  assertEquals(await hasAiConsent(on, "u"), true);
});
