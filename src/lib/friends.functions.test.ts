import { describe, expect, it, vi } from "vitest";
import { asTestFns, createSupabaseMock } from "./__testutils__/supabase-mock";

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
      validator: (v: (d: unknown) => unknown) => {
        validator = v;
        return builder;
      },
      handler:
        (fn: (opts: { data: unknown; context: unknown }) => unknown) =>
        async (opts: { data?: unknown; context?: unknown } = {}) => {
          const data = validator ? validator(opts.data) : opts.data;
          return fn({ data, context: opts.context ?? {} });
        },
    };
    return builder;
  },
}));

const {
  getFriends,
  acceptFriendInvite,
  getFriendInvitePreview,
  getMyFriendCode,
  createDuel,
  respondToDuel,
  getMyDuels,
} = asTestFns(await import("./friends.functions"));

const USER_ID = "22222222-2222-4222-8222-222222222222";
const INVITER_ID = "11111111-1111-4111-8111-111111111111";
const DUEL_ID = "33333333-3333-4333-8333-333333333333";

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

describe("getFriends", () => {
  it("maps RPC rows and fills in defaults for missing fields", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({
      data: [
        { user_id: "f1", display_name: "Ada", avatar_seed: "3", streak: 5, week_xp: 120 },
        { user_id: "f2", display_name: null, avatar_seed: null, streak: null, week_xp: null },
      ],
    });
    const result = await getFriends({ context: ctx(supabase) });
    expect(result).toEqual([
      { userId: "f1", displayName: "Ada", avatarSeed: "3", streak: 5, weekXp: 120 },
      { userId: "f2", displayName: "Learner", avatarSeed: "0", streak: 0, weekXp: 0 },
    ]);
  });

  it("returns an empty list when the RPC has no rows", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null });
    expect(await getFriends({ context: ctx(supabase) })).toEqual([]);
  });
});

const INVITE_CODE = "aB3xY9==";

describe("acceptFriendInvite", () => {
  it("returns the RPC's success row", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ ok: true, message: "friends now" }] });
    const result = await acceptFriendInvite({
      context: ctx(supabase),
      data: { code: INVITE_CODE },
    });
    expect(result).toEqual({ ok: true, message: "friends now" });
    expect(supabase.rpc).toHaveBeenCalledWith("accept_friend_invite", { _code: INVITE_CODE });
  });

  it("surfaces the RPC's own self/blocked rejections -- it, not this handler, resolves the code", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ ok: false, message: "cannot invite yourself" }] });
    const result = await acceptFriendInvite({
      context: ctx(supabase),
      data: { code: INVITE_CODE },
    });
    expect(result).toEqual({ ok: false, message: "cannot invite yourself" });
  });

  it("falls back to a generic failure when the RPC returns no rows", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [] });
    const result = await acceptFriendInvite({
      context: ctx(supabase),
      data: { code: INVITE_CODE },
    });
    expect(result).toEqual({ ok: false, message: "unknown error" });
  });

  it("rejects an empty code at the validator", async () => {
    const supabase = createSupabaseMock();
    await expect(
      acceptFriendInvite({ context: ctx(supabase), data: { code: "" } }),
    ).rejects.toThrow();
  });
});

describe("getFriendInvitePreview", () => {
  it("returns the inviter's display name and avatar", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({
      data: [{ ok: true, is_self: false, display_name: "Ada", avatar_seed: "7" }],
    });
    const result = await getFriendInvitePreview({
      context: ctx(supabase),
      data: { code: INVITE_CODE },
    });
    expect(result).toEqual({ isSelf: false, displayName: "Ada", avatarSeed: "7" });
    expect(supabase.rpc).toHaveBeenCalledWith("get_friend_invite_preview", { _code: INVITE_CODE });
  });

  it("flags the caller's own code as self", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({
      data: [{ ok: true, is_self: true, display_name: null, avatar_seed: null }],
    });
    const result = await getFriendInvitePreview({
      context: ctx(supabase),
      data: { code: INVITE_CODE },
    });
    expect(result).toEqual({ isSelf: true, displayName: null, avatarSeed: null });
  });

  it("returns null for an invalid code", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({
      data: [{ ok: false, is_self: false, display_name: null, avatar_seed: null }],
    });
    const result = await getFriendInvitePreview({
      context: ctx(supabase),
      data: { code: "bogus" },
    });
    expect(result).toBeNull();
  });
});

describe("getMyFriendCode", () => {
  it("returns the RPC's code", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ code: INVITE_CODE }] });
    const result = await getMyFriendCode({ context: ctx(supabase) });
    expect(result).toBe(INVITE_CODE);
    expect(supabase.rpc).toHaveBeenCalledWith("get_or_create_my_friend_code");
  });

  it("returns null when the RPC returns no rows", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [] });
    const result = await getMyFriendCode({ context: ctx(supabase) });
    expect(result).toBeNull();
  });
});

describe("createDuel", () => {
  it("returns the RPC's created duel id", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ ok: true, reason: null, duel_id: DUEL_ID }] });
    const result = await createDuel({
      context: ctx(supabase),
      data: { opponentId: INVITER_ID, course: "en" },
    });
    expect(result).toEqual({ ok: true, reason: null, duelId: DUEL_ID });
    expect(supabase.rpc).toHaveBeenCalledWith("create_duel", {
      _opponent_id: INVITER_ID,
      _course: "en",
    });
  });

  it("surfaces a not-friends rejection from the RPC", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ ok: false, reason: "not-friends", duel_id: null }] });
    const result = await createDuel({
      context: ctx(supabase),
      data: { opponentId: INVITER_ID, course: "en" },
    });
    expect(result).toEqual({ ok: false, reason: "not-friends", duelId: null });
  });

  it("treats an RPC error as a server-error result rather than throwing", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null, error: new Error("db down") });
    const result = await createDuel({
      context: ctx(supabase),
      data: { opponentId: INVITER_ID, course: "en" },
    });
    expect(result).toEqual({ ok: false, reason: "server-error", duelId: null });
  });
});

describe("respondToDuel", () => {
  it("returns the RPC's success result on accept", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ ok: true, reason: null }] });
    const result = await respondToDuel({
      context: ctx(supabase),
      data: { duelId: DUEL_ID, accept: true },
    });
    expect(result).toEqual({ ok: true, reason: null });
    expect(supabase.rpc).toHaveBeenCalledWith("respond_to_duel", {
      _duel_id: DUEL_ID,
      _accept: true,
    });
  });
});

describe("getMyDuels", () => {
  it("maps RPC rows and fills in defaults for missing fields", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({
      data: [
        {
          duel_id: DUEL_ID,
          challenger_id: USER_ID,
          opponent_id: INVITER_ID,
          course: "en",
          status: "active",
          challenger_xp_start: 100,
          opponent_xp_start: 50,
          challenger_xp_now: 150,
          opponent_xp_now: 80,
          winner_id: null,
          ends_at: "2026-09-23T00:00:00Z",
        },
      ],
    });
    const result = await getMyDuels({ context: ctx(supabase) });
    expect(result).toEqual([
      {
        duelId: DUEL_ID,
        challengerId: USER_ID,
        opponentId: INVITER_ID,
        course: "en",
        status: "active",
        challengerXpStart: 100,
        opponentXpStart: 50,
        challengerXpNow: 150,
        opponentXpNow: 80,
        winnerId: null,
        endsAt: "2026-09-23T00:00:00Z",
      },
    ]);
  });

  it("returns an empty list when the RPC has no rows", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null });
    expect(await getMyDuels({ context: ctx(supabase) })).toEqual([]);
  });
});
