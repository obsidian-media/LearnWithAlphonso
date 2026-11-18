import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { refreshSession } } }));
const saveOnServer = vi.fn();
vi.mock("./learner-profile.functions", () => ({ saveLearnerProfile: saveOnServer }));

beforeEach(() => {
  vi.resetModules();
  refreshSession.mockReset();
  saveOnServer.mockReset();
});

async function load() {
  const client = await import("./learner-profile.client");
  const firstRun = await import("./first-run");
  return { ...client, ...firstRun };
}

describe("saveLearnerProfile (browser)", () => {
  it("refreshes the session after a save, so the /learn gate sees the new metadata", async () => {
    const { saveLearnerProfile } = await load();
    saveOnServer.mockResolvedValue({ completedAt: "2026-11-18T00:00:00Z" });
    refreshSession.mockResolvedValue({ data: {}, error: null });
    await expect(saveLearnerProfile({ data: { patch: {}, mark: "completed" } })).resolves.toEqual({
      completedAt: "2026-11-18T00:00:00Z",
    });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(saveOnServer.mock.invocationCallOrder[0]).toBeLessThan(
      refreshSession.mock.invocationCallOrder[0],
    );
  });

  it("a finished or dismissed flow holds for the rest of the visit", async () => {
    const { saveLearnerProfile, completeProfileSkippedThisVisit } = await load();
    saveOnServer.mockResolvedValue({});
    expect(completeProfileSkippedThisVisit()).toBe(false);
    await saveLearnerProfile({ data: { patch: {}, mark: "completed" } });
    expect(completeProfileSkippedThisVisit()).toBe(true);
  });

  it("an ordinary answer save does not mark the flow skipped", async () => {
    const { saveLearnerProfile, completeProfileSkippedThisVisit } = await load();
    saveOnServer.mockResolvedValue({});
    await saveLearnerProfile({ data: { patch: { heardFrom: "friend" } as never } });
    expect(completeProfileSkippedThisVisit()).toBe(false);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("a failed refresh is not a failed save", async () => {
    const { saveLearnerProfile } = await load();
    saveOnServer.mockResolvedValue({ dismissedAt: "x" });
    refreshSession.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(saveLearnerProfile({ data: { patch: {}, mark: "dismissed" } })).resolves.toEqual({
      dismissedAt: "x",
    });
  });

  it("a failed save refreshes nothing and marks nothing", async () => {
    const { saveLearnerProfile, completeProfileSkippedThisVisit } = await load();
    saveOnServer.mockRejectedValue(new Error("offline"));
    await expect(saveLearnerProfile({ data: { patch: {}, mark: "completed" } })).rejects.toThrow(
      "offline",
    );
    expect(refreshSession).not.toHaveBeenCalled();
    expect(completeProfileSkippedThisVisit()).toBe(false);
  });
});
