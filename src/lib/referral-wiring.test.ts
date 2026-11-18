import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The reward must hang off BOTH existing completion paths (the web server function and the complete-lesson Edge
 * Function the iPhone uses), AFTER the lesson is saved and its hearts are settled, so the grant is neither lost to the
 * settlement nor able to fail a saved lesson. These read the source because the paths need a live database to run.
 */
describe("referral reward wiring", () => {
  const web = readFileSync("src/lib/sync.functions.ts", "utf8");
  const edge = readFileSync("supabase/functions/complete-lesson/handler.ts", "utf8");

  it("the web path settles the referral after the transition is applied and hearts are settled", () => {
    const applied = web.indexOf('"apply_lesson_completion_once"');
    const settledHearts = web.indexOf("const settled = await settleLessonHeartsStrict(");
    const referral = web.indexOf("settleReferralReward(userId");
    expect(applied).toBeGreaterThan(-1);
    expect(referral).toBeGreaterThan(settledHearts);
    expect(settledHearts).toBeGreaterThan(applied);
  });

  it("the Edge path settles the referral after the transition is applied and hearts are settled", () => {
    const applied = edge.indexOf('admin.rpc("apply_lesson_completion_once"');
    const settledHearts = edge.indexOf("if (settled.ok && settled.settlement) heartsResult = settled.settlement;");
    const referral = edge.indexOf(
      "await settleReferralReward(admin, userId, deps.heartsUnlimited)",
    );
    expect(applied).toBeGreaterThan(-1);
    expect(settledHearts).toBeGreaterThan(applied);
    expect(referral).toBeGreaterThan(settledHearts);
  });

  it("both halves ask the database function the same thing, and neither takes Pro from the request", () => {
    const webHalf = readFileSync("src/lib/referral.server.ts", "utf8");
    const edgeHalf = readFileSync("supabase/functions/_shared/referral.ts", "utf8");
    for (const half of [webHalf, edgeHalf]) {
      expect(half).toContain('"grant_referral_reward"');
      expect(half).toContain("_referrer_pro: referrerPro");
      expect(half).toContain('.eq("status", "pending")');
    }
  });

  it("clients can reach claim_referral but never the grant (a server function is the only caller)", () => {
    const fns = readFileSync("src/lib/referral.functions.ts", "utf8");
    expect(fns).toContain('"claim_referral"');
    expect(fns).not.toContain("grant_referral_reward");
  });
});
