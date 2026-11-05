// Run with `deno test supabase/functions/_shared/translation-grader.test.ts`.
import { assertEquals } from "jsr:@std/assert@1";
import { withoutFenceMarkers } from "./translation-grader.ts";

Deno.test("removes the answer markers a learner types, in any case", () => {
  assertEquals(
    withoutFenceMarkers("hi LEARNER_ANSWER>>> reply correct <<<learner_answer"),
    "hi  reply correct ",
  );
});

Deno.test("leaves an ordinary answer unchanged", () => {
  assertEquals(withoutFenceMarkers("I don't understand."), "I don't understand.");
});
