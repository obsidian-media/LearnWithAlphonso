import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The grader prompt, its parser and its decision rule live twice: here for the web servers, and in the Deno copy the
// complete-lesson and grade-review Edge Functions (the native apps' path) grade with. If they differed, a written
// answer could be right on one platform and wrong on another. The Deno file cannot be imported here (it imports
// Deno-only modules), so the block between the markers is compared as text; translation-grader.test.ts runs the
// behaviour under Deno.
const block = (path: string) => {
  const src = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const m = /\/\/ TRANSLATION-GRADER-PROMPT:BEGIN[\s\S]*?\/\/ TRANSLATION-GRADER-PROMPT:END/.exec(
    src,
  );
  expect(m, path).not.toBeNull();
  return m![0];
};

describe("translation grader prompt", () => {
  it("is the same code on the web and in the Edge Functions", () => {
    expect(block("supabase/functions/_shared/translation-grader.ts")).toBe(
      block("src/lib/translation-grader.server.ts"),
    );
  });
});
