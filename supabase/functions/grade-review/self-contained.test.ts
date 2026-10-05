import { assertEquals } from "jsr:@std/assert@1";
import { gradeSelfContained, isSelfContainedSource } from "./self-contained.ts";

Deno.test("weakness and saved_word rows are self-contained; lesson rows are not", () => {
  assertEquals(isSelfContainedSource("weakness"), true);
  assertEquals(isSelfContainedSource("saved_word"), true);
  assertEquals(isSelfContainedSource("lesson"), false);
  assertEquals(isSelfContainedSource(null), false);
  assertEquals(isSelfContainedSource(undefined), false);
});

Deno.test("grades from the stored choices and answer_index", () => {
  const row = { choices: ["a", "b", "c", "d"], answer_index: 2 };
  assertEquals(gradeSelfContained(row, "c"), true);
  assertEquals(gradeSelfContained(row, "a"), false);
  assertEquals(gradeSelfContained(row, ""), false);
});

Deno.test("a malformed row never grades correct", () => {
  assertEquals(gradeSelfContained({ choices: null, answer_index: 0 }, "a"), false);
  assertEquals(gradeSelfContained({ choices: ["a"], answer_index: 5 }, "a"), false);
  assertEquals(gradeSelfContained({ choices: ["a"], answer_index: "0" }, "a"), false);
});
