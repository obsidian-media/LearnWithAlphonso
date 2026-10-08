import { assertEquals } from "jsr:@std/assert@1";
import { lessonPayloadMatches } from "./lesson-version.ts";

const lesson = { questions: [{ id: "q1" }, { id: "q2" }, { id: "q3" }] };
const answers = (...ids: string[]) => ids.map((questionId) => ({ questionId }));

Deno.test("matches when total and the answered id set equal the server lesson", () => {
  assertEquals(lessonPayloadMatches(lesson, 3, answers("q1", "q2", "q3")), true);
});
Deno.test("a missing server lesson is a mismatch", () => {
  assertEquals(lessonPayloadMatches(null, 3, answers("q1", "q2", "q3")), false);
});
Deno.test("a different question count is a mismatch (content re-seeded with more questions)", () => {
  assertEquals(lessonPayloadMatches(lesson, 2, answers("q1", "q2")), false);
});
Deno.test("a foreign or duplicate question id is a mismatch", () => {
  assertEquals(lessonPayloadMatches(lesson, 3, answers("q1", "q2", "q9")), false);
  assertEquals(lessonPayloadMatches(lesson, 3, answers("q1", "q1", "q3")), false);
});
Deno.test("a total that disagrees with the lesson is a mismatch even when every answer id is valid", () => {
  assertEquals(lessonPayloadMatches(lesson, 5, answers("q1", "q2", "q3")), false);
});
