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
  getMyBuddy,
  getBuddyRequests,
  requestBuddy,
  respondBuddyRequest,
  cancelBuddyRequest,
  endBuddy,
} = asTestFns(await import("./buddy.functions"));

const FRIEND = "3f2b6c1e-8a4d-4c7e-9b1a-2d5e6f708192";
const REQUEST = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: "user-1" };
}
function rpcReturning(value: unknown) {
  const supabase = createSupabaseMock();
  supabase.rpc.mockResolvedValue({ data: value, error: null });
  return supabase;
}
function rpcFailing() {
  const supabase = createSupabaseMock();
  supabase.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
  return supabase;
}

describe("getMyBuddy", () => {
  it("returns null when the user has no buddy", async () => {
    const supabase = rpcReturning([]);
    await expect(getMyBuddy({ context: ctx(supabase) })).resolves.toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith("get_my_buddy");
  });

  it("throws on an RPC error so a failure never reads as 'no buddy'", async () => {
    await expect(getMyBuddy({ context: ctx(rpcFailing()) })).rejects.toThrow("getMyBuddy: boom");
  });

  it("maps the row", async () => {
    const supabase = rpcReturning([
      {
        pair_id: "p1",
        buddy_id: "u2",
        buddy_name: "Bo",
        buddy_avatar_seed: "cd",
        paired_at: "2026-10-01T00:00:00Z",
        week_start: "2026-10-05",
        my_count: 2,
        buddy_count: 3,
        goal: 3,
        streak_weeks: 4,
        grace_available: false,
        last_outcome: "grace",
      },
    ]);
    await expect(getMyBuddy({ context: ctx(supabase) })).resolves.toEqual({
      pairId: "p1",
      buddyId: "u2",
      buddyName: "Bo",
      buddyAvatarSeed: "cd",
      pairedAt: "2026-10-01T00:00:00Z",
      weekStart: "2026-10-05",
      myCount: 2,
      buddyCount: 3,
      goal: 3,
      streakWeeks: 4,
      graceAvailable: false,
      lastOutcome: "grace",
    });
  });
});

describe("getBuddyRequests", () => {
  it("maps each pending request with its direction", async () => {
    const supabase = rpcReturning([
      {
        request_id: "r1",
        direction: "incoming",
        other_id: "u2",
        other_name: "Bo",
        other_avatar_seed: "cd",
        requested_at: "2026-10-06T00:00:00Z",
      },
    ]);
    await expect(getBuddyRequests({ context: ctx(supabase) })).resolves.toEqual([
      {
        requestId: "r1",
        direction: "incoming",
        otherId: "u2",
        otherName: "Bo",
        otherAvatarSeed: "cd",
        requestedAt: "2026-10-06T00:00:00Z",
      },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith("get_buddy_requests");
  });

  it("throws on an RPC error", async () => {
    await expect(getBuddyRequests({ context: ctx(rpcFailing()) })).rejects.toThrow(
      "getBuddyRequests: boom",
    );
  });
});

describe("requestBuddy", () => {
  it("passes the friend id and returns the server's status unchanged", async () => {
    const supabase = rpcReturning([{ status: "friend_paired" }]);
    await expect(
      requestBuddy({ context: ctx(supabase), data: { friendId: FRIEND } }),
    ).resolves.toEqual({
      status: "friend_paired",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("request_buddy", { _friend: FRIEND });
  });

  it("rejects a non-uuid friend id before calling the server", async () => {
    const supabase = rpcReturning([]);
    await expect(
      requestBuddy({ context: ctx(supabase), data: { friendId: "x" } }),
    ).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("answers 'unknown' when the server returns no row", async () => {
    await expect(
      requestBuddy({ context: ctx(rpcReturning([])), data: { friendId: FRIEND } }),
    ).resolves.toEqual({ status: "unknown" });
  });

  it("throws on an RPC error", async () => {
    await expect(
      requestBuddy({ context: ctx(rpcFailing()), data: { friendId: FRIEND } }),
    ).rejects.toThrow("requestBuddy: boom");
  });
});

describe("respondBuddyRequest", () => {
  it("passes the request id and the answer", async () => {
    const supabase = rpcReturning([{ status: "paired" }]);
    await expect(
      respondBuddyRequest({ context: ctx(supabase), data: { requestId: REQUEST, accept: true } }),
    ).resolves.toEqual({ status: "paired" });
    expect(supabase.rpc).toHaveBeenCalledWith("respond_buddy_request", {
      _request: REQUEST,
      _accept: true,
    });
  });

  it("throws on an RPC error", async () => {
    await expect(
      respondBuddyRequest({
        context: ctx(rpcFailing()),
        data: { requestId: REQUEST, accept: false },
      }),
    ).rejects.toThrow("respondBuddyRequest: boom");
  });
});

describe("cancelBuddyRequest", () => {
  it("passes the request id", async () => {
    const supabase = rpcReturning([{ status: "cancelled" }]);
    await expect(
      cancelBuddyRequest({ context: ctx(supabase), data: { requestId: REQUEST } }),
    ).resolves.toEqual({
      status: "cancelled",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("cancel_buddy_request", { _request: REQUEST });
  });

  it("throws on an RPC error", async () => {
    await expect(
      cancelBuddyRequest({ context: ctx(rpcFailing()), data: { requestId: REQUEST } }),
    ).rejects.toThrow("cancelBuddyRequest: boom");
  });
});

describe("endBuddy", () => {
  it("calls end_buddy and returns the status", async () => {
    const supabase = rpcReturning([{ status: "ended" }]);
    await expect(endBuddy({ context: ctx(supabase) })).resolves.toEqual({ status: "ended" });
    expect(supabase.rpc).toHaveBeenCalledWith("end_buddy");
  });

  it("throws on an RPC error", async () => {
    await expect(endBuddy({ context: ctx(rpcFailing()) })).rejects.toThrow("endBuddy: boom");
  });
});
