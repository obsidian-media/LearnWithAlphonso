import { describe, expect, it, vi } from "vitest";
import { asTestFns, chainable, createSupabaseMock } from "./__testutils__/supabase-mock";
import {
  freezeReceivedToast,
  giftAriaLabel,
  giftButtonState,
  giftFreezeMessage,
  giftFreezeReason,
} from "./freeze-gift";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: ((d: unknown) => unknown) | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (v: (d: unknown) => unknown) => {
        validator = v;
        return builder;
      },
      handler:
        (fn: (opts: { data: unknown; context: unknown }) => unknown) =>
        async (opts: { data?: unknown; context?: unknown } = {}) =>
          fn({ data: validator ? validator(opts.data) : opts.data, context: opts.context ?? {} }),
    };
    return builder;
  },
}));

const { giftStreakFreeze, getFreezeGiftState, getUnreadFreezeGifts, markFreezeGiftsRead } =
  asTestFns(await import("./friends.functions"));
const ME = "22222222-2222-4222-8222-222222222222";
const FRIEND = "11111111-1111-4111-8111-111111111111";
const ctx = (supabase: ReturnType<typeof createSupabaseMock>) => ({ supabase, userId: ME });

describe("gift messages and button state", () => {
  it("names each refusal in its own words", () => {
    const refuse = (reason: Parameters<typeof giftFreezeReason>[0]) =>
      giftFreezeMessage({ ok: false, reason: giftFreezeReason(reason), freezes: 0 }, "Sam");
    expect(giftFreezeMessage({ ok: true, freezes: 1 }, "Sam")).toBe("Freeze sent to Sam.");
    expect(refuse("recipient-full")).toMatch(/already has all the freezes/);
    expect(refuse("already-gifted-today")).toMatch(/already gifted Sam a freeze today/);
    expect(refuse("no-freeze")).toMatch(/no streak freeze/);
    expect(refuse("something-new")).toMatch(/Try again/);
    expect(new Set(["recipient-full", "already-gifted-today", "no-freeze"].map(refuse)).size).toBe(
      3,
    );
  });

  it("an unknown or missing reason is a plain error, never a made-up reason", () => {
    expect(giftFreezeReason(undefined)).toBe("error");
    expect(giftFreezeReason("drop table")).toBe("error");
    expect(giftFreezeReason("recipient-full")).toBe("recipient-full");
  });

  it("the button: sent today wins, then none to give, otherwise send; unknown balance still offers it", () => {
    const sent = new Set([FRIEND]);
    expect(giftButtonState(3, sent, FRIEND)).toBe("sent-today");
    expect(giftButtonState(0, new Set(), FRIEND)).toBe("no-freeze");
    expect(giftButtonState(1, new Set(), FRIEND)).toBe("send");
    expect(giftButtonState(null, new Set(), FRIEND)).toBe("send");
    expect(giftButtonState(undefined, new Set(), FRIEND)).toBe("send");
    expect(giftAriaLabel("Sam", "sent-today")).toMatch(/already sent to Sam today/);
    expect(giftAriaLabel("Sam", "send")).toBe("Gift a streak freeze to Sam");
  });

  it("the received toast names one friend or counts several", () => {
    expect(freezeReceivedToast(["Sam"])).toBe("Sam gifted you a streak freeze!");
    expect(freezeReceivedToast(["Sam", "Ana"])).toBe("2 friends gifted you a streak freeze!");
  });
});

describe("giftStreakFreeze", () => {
  it("sends only the recipient to the database function and maps success", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValueOnce({
      data: [{ ok: true, reason: null, freezes: 1 }],
      error: null,
    });
    const r = await giftStreakFreeze({ context: ctx(supabase), data: { recipientId: FRIEND } });
    expect(r).toEqual({ ok: true, freezes: 1 });
    expect(supabase.rpc).toHaveBeenCalledWith("gift_streak_freeze", { _recipient: FRIEND });
  });

  it("passes a known refusal through and turns an rpc error into a plain error", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValueOnce({
      data: [{ ok: false, reason: "recipient-full", freezes: 2 }],
      error: null,
    });
    expect(
      await giftStreakFreeze({ context: ctx(supabase), data: { recipientId: FRIEND } }),
    ).toEqual({
      ok: false,
      reason: "recipient-full",
      freezes: 2,
    });
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(
      await giftStreakFreeze({ context: ctx(supabase), data: { recipientId: FRIEND } }),
    ).toEqual({
      ok: false,
      reason: "error",
      freezes: null,
    });
  });

  it("rejects a recipient that is not a uuid before any call", async () => {
    const supabase = createSupabaseMock();
    await expect(
      giftStreakFreeze({ context: ctx(supabase), data: { recipientId: "not-a-uuid" } }),
    ).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("gift state and receipt reads", () => {
  it("getFreezeGiftState reads the caller's own balance and today's sent gifts", async () => {
    const supabase = createSupabaseMock();
    supabase.from
      .mockReturnValueOnce(chainable({ data: { streak_freezes: 2 }, error: null }))
      .mockReturnValueOnce(chainable({ data: [{ recipient_id: FRIEND }], error: null }));
    expect(await getFreezeGiftState({ context: ctx(supabase) })).toEqual({
      freezes: 2,
      giftedTodayTo: [FRIEND],
    });
  });

  it("a failed read says unknown rather than zero, so the page does not hide a button it cannot justify", async () => {
    const supabase = createSupabaseMock();
    supabase.from
      .mockReturnValueOnce(chainable({ data: null, error: { message: "x" } }))
      .mockReturnValueOnce(chainable({ data: null, error: { message: "x" } }));
    expect(await getFreezeGiftState({ context: ctx(supabase) })).toEqual({
      freezes: null,
      giftedTodayTo: [],
    });
  });

  it("getUnreadFreezeGifts returns the caller's unread rows; an error reads as none", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(
      chainable({ data: [{ id: "g1", sender_id: FRIEND, created_at: "t" }], error: null }),
    );
    expect(await getUnreadFreezeGifts({ context: ctx(supabase) })).toEqual([
      { id: "g1", senderId: FRIEND, createdAt: "t" },
    ]);
    supabase.from.mockReturnValueOnce(chainable({ data: null, error: { message: "x" } }));
    expect(await getUnreadFreezeGifts({ context: ctx(supabase) })).toEqual([]);
  });

  it("markFreezeGiftsRead updates only read_at and does nothing for an empty list", async () => {
    const supabase = createSupabaseMock();
    expect(await markFreezeGiftsRead({ context: ctx(supabase), data: { ids: [] } })).toEqual({
      ok: true,
    });
    expect(supabase.from).not.toHaveBeenCalled();
    const chain = chainable({ data: null, error: null });
    supabase.from.mockReturnValueOnce(chain);
    await markFreezeGiftsRead({ context: ctx(supabase), data: { ids: [FRIEND] } });
    expect(supabase.from).toHaveBeenCalledWith("streak_freeze_gifts");
    const update = chain.calls.find((c) => c.method === "update");
    expect(Object.keys(update!.args[0] as object)).toEqual(["read_at"]);
  });
});
