import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LESSON_SESSION_MAX_AGE_MS,
  LESSON_SESSION_RENEW_MARGIN_MS,
  lessonSessionNeedsRenewal,
} from "./lesson-session-age";

describe("lesson session age", () => {
  it("matches the server's MAX_AGE_MS (lesson-session.server.ts)", () => {
    const src = readFileSync("src/lib/lesson-session.server.ts", "utf8");
    const m = /const MAX_AGE_MS = ([\d\s*_]+);/.exec(src);
    expect(m, "MAX_AGE_MS declaration").not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const serverMs = new Function(`return ${m![1]!.replace(/_/g, "")};`)() as number;
    expect(serverMs).toBe(LESSON_SESSION_MAX_AGE_MS);
  });

  it("keeps a fresh token and renews one close to the server's limit", () => {
    const t0 = 1_000_000;
    expect(lessonSessionNeedsRenewal(t0, t0)).toBe(false);
    expect(lessonSessionNeedsRenewal(t0, t0 + 60 * 60 * 1000)).toBe(false);
    const edge = t0 + LESSON_SESSION_MAX_AGE_MS - LESSON_SESSION_RENEW_MARGIN_MS;
    expect(lessonSessionNeedsRenewal(t0, edge - 1)).toBe(false);
    expect(lessonSessionNeedsRenewal(t0, edge)).toBe(true);
    expect(lessonSessionNeedsRenewal(t0, t0 + LESSON_SESSION_MAX_AGE_MS + 1)).toBe(true);
  });
});
