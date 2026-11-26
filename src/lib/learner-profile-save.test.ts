// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { refreshSession } } }));
const saveOnServer = vi.fn();
vi.mock("./learner-profile.functions", () => ({ saveLearnerProfile: saveOnServer }));

beforeEach(() => {
  vi.resetModules();
  refreshSession.mockReset();
  saveOnServer.mockReset();
  localStorage.clear();
});

async function load() {
  const client = await import("./learner-profile-save");
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

describe("Not now on Complete your profile", () => {
  it("a failed server write is remembered on this device and held for the visit, never lost", async () => {
    const { dismissCompleteProfile, completeProfileSkippedThisVisit, hasPendingDismissal } =
      await load();
    saveOnServer.mockRejectedValue(new Error("offline"));
    await expect(dismissCompleteProfile("u1")).resolves.toBe(false);
    expect(hasPendingDismissal("u1")).toBe(true);
    expect(completeProfileSkippedThisVisit()).toBe(true);
    expect(hasPendingDismissal("u2")).toBe(false);
  });

  it("a successful write leaves nothing pending", async () => {
    const { dismissCompleteProfile, hasPendingDismissal } = await load();
    saveOnServer.mockResolvedValue({ dismissedAt: "2026-11-26T00:00:00Z" });
    refreshSession.mockResolvedValue({ data: {}, error: null });
    await expect(dismissCompleteProfile("u1")).resolves.toBe(true);
    expect(saveOnServer).toHaveBeenCalledWith({ data: { patch: {}, mark: "dismissed" } });
    expect(hasPendingDismissal("u1")).toBe(false);
  });

  it("a later visit retries the write and clears it only once the server has it", async () => {
    const { dismissCompleteProfile, retryPendingDismissal, hasPendingDismissal } = await load();
    saveOnServer.mockRejectedValue(new Error("offline"));
    await dismissCompleteProfile("u1");
    await expect(retryPendingDismissal("u1")).resolves.toBe(false);
    expect(hasPendingDismissal("u1")).toBe(true);
    saveOnServer.mockResolvedValue({ dismissedAt: "2026-11-26T00:00:00Z" });
    await expect(retryPendingDismissal("u1")).resolves.toBe(true);
    expect(hasPendingDismissal("u1")).toBe(false);
  });

  it("sends nothing when nothing is pending", async () => {
    const { retryPendingDismissal } = await load();
    await expect(retryPendingDismissal("u1")).resolves.toBe(true);
    expect(saveOnServer).not.toHaveBeenCalled();
  });

  it("pending dismissals are per account and survive a corrupt value", async () => {
    const {
      rememberPendingDismissal,
      hasPendingDismissal,
      clearPendingDismissal,
      PENDING_DISMISSAL_KEY,
    } = await load();
    rememberPendingDismissal("a");
    rememberPendingDismissal("b");
    clearPendingDismissal("a");
    expect(hasPendingDismissal("a")).toBe(false);
    expect(hasPendingDismissal("b")).toBe(true);
    localStorage.setItem(PENDING_DISMISSAL_KEY, "{not json");
    expect(hasPendingDismissal("b")).toBe(false);
  });
});
