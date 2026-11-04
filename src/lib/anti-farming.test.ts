import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HOURLY_COMPLETION_LIMIT, isCompletionRefusal, SLOW_DOWN_MESSAGE } from "./anti-farming";

const DENO_COPY = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../supabase/functions/complete-lesson/anti-farming.ts"),
  "utf8",
);

describe("anti-farming (web copy)", () => {
  it("uses the same ceiling as the Edge Function copy", () => {
    expect(DENO_COPY).toContain(`HOURLY_COMPLETION_LIMIT = ${HOURLY_COMPLETION_LIMIT};`);
  });

  it("has no per-question speed floor in either copy (a client that mints its token at finish time would be refused)", () => {
    expect(DENO_COPY).not.toMatch(/completedTooFast|MIN_SECONDS_PER_QUESTION/);
    expect(
      fs.readFileSync(path.resolve(import.meta.dirname, "anti-farming.ts"), "utf8"),
    ).not.toMatch(/completedTooFast|MIN_SECONDS_PER_QUESTION/);
  });

  it("recognises only the rate-limited code", () => {
    expect(isCompletionRefusal(new Error("rate-limited"))).toBe(true);
    expect(isCompletionRefusal(new Error("too-fast"))).toBe(false);
    expect(isCompletionRefusal(new Error("Could not save lesson completion; retry"))).toBe(false);
    expect(SLOW_DOWN_MESSAGE).toBe("Slow down a little and try again.");
  });
});
