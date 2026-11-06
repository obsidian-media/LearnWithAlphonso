import { beforeEach, describe, expect, it, vi } from "vitest";

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

const getUserById = vi.fn();
const updateUserById = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { admin: { getUserById, updateUserById } } },
}));

const { saveLearnerProfile } = await import("./learner-profile.functions");
type Call = (opts: { data: unknown; context: unknown }) => Promise<unknown>;
const save = saveLearnerProfile as unknown as Call;

function ctx() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { context: { supabase: { from }, userId: "u1" }, from, update, eq };
}

beforeEach(() => {
  getUserById.mockReset();
  updateUserById.mockReset();
  getUserById.mockResolvedValue({
    data: { user: { user_metadata: { voices: { alphonso: { es: "x" } }, given_name: "Sam" } } },
    error: null,
  });
  updateUserById.mockResolvedValue({ data: {}, error: null });
});

describe("saveLearnerProfile", () => {
  it("merges the answers into user_metadata.learner_profile and keeps the other metadata", async () => {
    const c = ctx();
    await save({ data: { patch: { goal: "travel", ageRange: "25-34" } }, context: c.context });
    expect(updateUserById).toHaveBeenCalledTimes(1);
    const [id, attrs] = updateUserById.mock.calls[0];
    expect(id).toBe("u1");
    expect(attrs.user_metadata.voices).toEqual({ alphonso: { es: "x" } });
    expect(attrs.user_metadata.given_name).toBe("Sam");
    expect(attrs.user_metadata.learner_profile).toMatchObject({
      goal: "travel",
      ageRange: "25-34",
      showFlag: false,
    });
  });

  it("refuses an under-13 range before anything is written", async () => {
    const c = ctx();
    await expect(
      save({ data: { patch: { ageRange: "under-13" } }, context: c.context }),
    ).rejects.toThrow();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(c.from).not.toHaveBeenCalled();
  });

  it("the leaderboard country is the learner's country only while the flag is on", async () => {
    const on = ctx();
    await save({ data: { patch: { country: "CA", showFlag: true } }, context: on.context });
    expect(on.from).toHaveBeenCalledWith("profiles");
    expect(on.update).toHaveBeenCalledWith({ country: "CA" });
    expect(on.eq).toHaveBeenCalledWith("id", "u1");

    const off = ctx();
    await save({ data: { patch: { country: "CA", showFlag: false } }, context: off.context });
    expect(off.update).toHaveBeenCalledWith({ country: null });
  });

  it("an answer that does not touch the flag or country leaves the public profile alone", async () => {
    const c = ctx();
    await save({ data: { patch: { interests: ["food"] } }, context: c.context });
    expect(c.from).not.toHaveBeenCalled();
  });

  it("stamps completed or dismissed with the server's clock, never the client's", async () => {
    const c = ctx();
    await save({ data: { patch: {}, mark: "completed" }, context: c.context });
    const stored = updateUserById.mock.calls[0][1].user_metadata.learner_profile;
    expect(Date.parse(stored.completedAt)).toBeGreaterThan(Date.now() - 60_000);
    await expect(
      save({ data: { patch: { completedAt: "2000-01-01" } }, context: c.context }),
    ).rejects.toThrow();
  });

  it("fails loudly when the account cannot be read, so nothing is half-saved", async () => {
    getUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: "x" } });
    const c = ctx();
    await expect(save({ data: { patch: { goal: "fun" } }, context: c.context })).rejects.toThrow();
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
