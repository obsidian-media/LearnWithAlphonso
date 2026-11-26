import { describe, expect, it, vi } from "vitest";
import {
  REFERRAL_KEEP_MS,
  REFERRAL_MONTHLY_CAP,
  REFERRAL_STORAGE_KEY,
  captureRef,
  captureRefCode,
  parseRefCode,
  capReached,
  claimIsFinal,
  claimPendingRef,
  claimReason,
  parseRefParam,
  readPendingRef,
  referralCountLine,
  referralLink,
  rewardsLeft,
  summarizeReferrals,
  utcMonthStart,
  type ClaimResult,
} from "./referral";
import { settleReferralReward, type ReferralDeps } from "./referral.server";

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe("capturing a ?ref= code", () => {
  it("reads a well-formed code and ignores anything else", () => {
    expect(parseRefParam("?ref=AbC123xyz")).toBe("AbC123xyz");
    expect(parseRefParam("?utm_source=x&ref=Ab_-1234")).toBe("Ab_-1234");
    expect(parseRefParam("?ref=")).toBeNull();
    expect(parseRefParam("")).toBeNull();
    expect(parseRefParam("?ref=<script>")).toBeNull();
    expect(parseRefParam("?ref=ab")).toBeNull();
    expect(parseRefParam(`?ref=${"a".repeat(40)}`)).toBeNull();
  });

  it("puts back the + that a query string turns into a space", () => {
    expect(parseRefParam("?ref=ab+cd/ef")).toBe("ab+cd/ef");
  });

  it("keeps a code from the /r/<code> share link in the same slot ?ref= uses, and the claim path reads it", async () => {
    const s = memoryStore();
    captureRefCode("29d081151d67", s, 1000);
    expect(readPendingRef(s, 2000)).toBe("29d081151d67");
    const claim = vi.fn(async (): Promise<ClaimResult> => ({ ok: true }));
    expect(await claimPendingRef(s, claim, 2000)).toBe("claimed");
    expect(claim).toHaveBeenCalledWith("29d081151d67");
  });

  it("ignores a junk code from the share link and keeps the first code", () => {
    const s = memoryStore();
    for (const junk of ["", "a", "<script>", "a".repeat(33), "has space!", null, undefined]) {
      captureRefCode(junk, s, 1000);
    }
    expect(readPendingRef(s, 1000)).toBeNull();
    captureRefCode("FirstCode1", s, 1000);
    captureRefCode("SecondCode2", s, 2000);
    expect(readPendingRef(s, 3000)).toBe("FirstCode1");
    expect(parseRefCode("ab%2Bc")).toBeNull();
    expect(parseRefCode(" ab+cd ")).toBe("ab+cd");
  });

  it("keeps the first code: a later link never replaces it", () => {
    const s = memoryStore();
    captureRef("?ref=FirstCode1", s, 1000);
    captureRef("?ref=SecondCode2", s, 2000);
    expect(readPendingRef(s, 3000)).toBe("FirstCode1");
  });

  it("forgets a code after 30 days, and survives blocked storage", () => {
    const s = memoryStore();
    captureRef("?ref=FirstCode1", s, 1000);
    expect(readPendingRef(s, 1000 + REFERRAL_KEEP_MS + 1)).toBeNull();
    expect(s.m.has(REFERRAL_STORAGE_KEY)).toBe(false);
    expect(() => captureRef("?ref=FirstCode1", null)).not.toThrow();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => captureRef("?ref=FirstCode1", broken)).not.toThrow();
    expect(readPendingRef(broken)).toBeNull();
  });

  it("a tampered stored value is ignored", () => {
    const s = memoryStore();
    s.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code: "<img onerror>", at: 1 }));
    expect(readPendingRef(s, 2)).toBeNull();
    s.setItem(REFERRAL_STORAGE_KEY, "not json");
    expect(readPendingRef(s, 2)).toBeNull();
  });
});

describe("carrying the code through signup (claimPendingRef)", () => {
  it("claims once and clears the code", async () => {
    const s = memoryStore();
    captureRef("?ref=FirstCode1", s, 1000);
    const claim = vi.fn(async (): Promise<ClaimResult> => ({ ok: true }));
    expect(await claimPendingRef(s, claim, 2000)).toBe("claimed");
    expect(claim).toHaveBeenCalledWith("FirstCode1");
    expect(await claimPendingRef(s, claim, 3000)).toBe("none");
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it("a real refusal is final and clears the code (never retried)", async () => {
    const s = memoryStore();
    captureRef("?ref=FirstCode1", s, 1000);
    const claim = async (): Promise<ClaimResult> => ({ ok: false, reason: "too-late" });
    expect(await claimPendingRef(s, claim, 2000)).toBe("refused");
    expect(readPendingRef(s, 2000)).toBeNull();
  });

  it("an unexplained error or a thrown request keeps the code for the next visit", async () => {
    const s = memoryStore();
    captureRef("?ref=FirstCode1", s, 1000);
    expect(await claimPendingRef(s, async () => ({ ok: false, reason: "error" }), 2000)).toBe(
      "retry-later",
    );
    expect(await claimPendingRef(s, async () => Promise.reject(new Error("offline")), 2000)).toBe(
      "retry-later",
    );
    expect(readPendingRef(s, 2000)).toBe("FirstCode1");
  });

  it("does nothing, and sends nothing, with no stored code", async () => {
    const claim = vi.fn();
    expect(await claimPendingRef(memoryStore(), claim)).toBe("none");
    expect(claim).not.toHaveBeenCalled();
  });

  it("claim reasons the database does not know read as a plain error", () => {
    expect(claimReason("self")).toBe("self");
    expect(claimReason("surprise")).toBe("error");
    expect(claimIsFinal({ ok: false, reason: "error" })).toBe(false);
    expect(claimIsFinal({ ok: false, reason: "self" })).toBe(true);
  });
});

describe("the Invite screen's numbers", () => {
  const NOW = Date.UTC(2026, 10, 17, 12);
  it("builds the link", () => {
    expect(referralLink("https://learnwithalphonso.com/", "ab+c/d=")).toBe(
      "https://learnwithalphonso.com/r/ab%2Bc%2Fd%3D",
    );
  });

  it("counts completed, pending and this month's rewarded referrals", () => {
    const s = summarizeReferrals(
      [
        { status: "pending", capped: false, completed_at: null },
        { status: "completed", capped: false, completed_at: "2026-11-02T10:00:00Z" },
        { status: "completed", capped: true, completed_at: "2026-11-03T10:00:00Z" },
        { status: "completed", capped: false, completed_at: "2026-10-31T23:59:59Z" },
      ],
      NOW,
    );
    expect(s).toEqual({ completed: 3, pending: 1, rewardedThisMonth: 1 });
  });

  it("the month starts at 00:00 UTC on the 1st", () => {
    expect(utcMonthStart(NOW)).toBe(Date.UTC(2026, 10, 1));
  });

  it("cap reached at exactly the cap, and not before; the next month starts fresh", () => {
    expect(capReached({ rewardedThisMonth: REFERRAL_MONTHLY_CAP - 1 })).toBe(false);
    expect(capReached({ rewardedThisMonth: REFERRAL_MONTHLY_CAP })).toBe(true);
    expect(rewardsLeft({ rewardedThisMonth: REFERRAL_MONTHLY_CAP + 3 })).toBe(0);
    const rows = Array.from({ length: REFERRAL_MONTHLY_CAP }, () => ({
      status: "completed",
      capped: false,
      completed_at: "2026-11-05T00:00:00Z",
    }));
    expect(capReached(summarizeReferrals(rows, NOW))).toBe(true);
    expect(capReached(summarizeReferrals(rows, Date.UTC(2026, 11, 1)))).toBe(false);
  });

  it("describes the count in plain words", () => {
    expect(referralCountLine({ completed: 0, pending: 0, rewardedThisMonth: 0 })).toBe(
      "No friends have finished a first lesson yet.",
    );
    expect(referralCountLine({ completed: 1, pending: 2, rewardedThisMonth: 1 })).toBe(
      "1 friend joined and finished a first lesson. 2 still to start.",
    );
  });
});

describe("settleReferralReward (the server hook after a saved completion)", () => {
  function deps(pending: string | null, pro: boolean, rpcData: unknown = { status: "granted" }) {
    const rpc = vi.fn(async () => ({ data: rpcData, error: null }));
    const isPro = vi.fn(async () => pro);
    const d: ReferralDeps = {
      db: async () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: pending ? { referrer_id: pending } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
        rpc,
      }),
      isPro,
    };
    return { d, rpc, isPro };
  }

  it("does nothing, and asks nobody about Pro, for a learner with no pending referral", async () => {
    const { d, rpc, isPro } = deps(null, false);
    expect(await settleReferralReward("u1", d)).toBe("none");
    expect(rpc).not.toHaveBeenCalled();
    expect(isPro).not.toHaveBeenCalled();
  });

  it("asks whether the REFERRER (not the friend) is Pro and passes the answer to the database", async () => {
    const { d, rpc, isPro } = deps("ref-1", true);
    expect(await settleReferralReward("friend-1", d)).toBe("granted");
    expect(isPro).toHaveBeenCalledWith("ref-1");
    expect(rpc).toHaveBeenCalledWith("grant_referral_reward", {
      _referee: "friend-1",
      _referrer_pro: true,
    });
  });

  it("never throws: a failed read or grant leaves the lesson alone", async () => {
    const boom: ReferralDeps = {
      db: async () => {
        throw new Error("down");
      },
      isPro: async () => false,
    };
    expect(await settleReferralReward("u", boom)).toBe("error");
    const { d } = deps("ref-1", false);
    const failing: ReferralDeps = {
      ...d,
      db: async () => ({
        ...(await d.db()),
        rpc: async () => ({ data: null, error: { message: "x" } }),
      }),
    };
    expect(await settleReferralReward("u", failing)).toBe("error");
  });

  it("reports capped and not-yet, and treats anything else as none", async () => {
    expect(await settleReferralReward("u", deps("r", false, { status: "capped" }).d)).toBe(
      "capped",
    );
    expect(await settleReferralReward("u", deps("r", false, { status: "not-yet" }).d)).toBe(
      "not-yet",
    );
    expect(await settleReferralReward("u", deps("r", false, { status: "weird" }).d)).toBe("none");
  });
});
