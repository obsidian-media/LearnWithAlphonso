import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  completedTooFast,
  HOURLY_COMPLETION_LIMIT,
  isCompletionRefusal,
  MIN_SECONDS_PER_QUESTION,
  SLOW_DOWN_MESSAGE,
} from "./anti-farming";

const DENO_COPY = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../supabase/functions/complete-lesson/anti-farming.ts"),
  "utf8",
);

describe("anti-farming (web copy)", () => {
  it("uses the same constants as the Edge Function copy", () => {
    expect(DENO_COPY).toContain(`MIN_SECONDS_PER_QUESTION = ${MIN_SECONDS_PER_QUESTION};`);
    expect(DENO_COPY).toContain(`HOURLY_COMPLETION_LIMIT = ${HOURLY_COMPLETION_LIMIT};`);
  });

  it("refuses only below 0.4 s per question", () => {
    expect(completedTooFast(0, 3_199, 8)).toBe(true);
    expect(completedTooFast(0, 3_200, 8)).toBe(false);
    expect(completedTooFast(Number.NaN, 5, 8)).toBe(false);
  });

  it("recognises the two refusal codes and nothing else", () => {
    expect(isCompletionRefusal(new Error("too-fast"))).toBe(true);
    expect(isCompletionRefusal(new Error("rate-limited"))).toBe(true);
    expect(isCompletionRefusal(new Error("Could not save lesson completion; retry"))).toBe(false);
    expect(SLOW_DOWN_MESSAGE).toBe("Slow down a little and try again.");
  });
});
