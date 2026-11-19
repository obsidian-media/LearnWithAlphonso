import { describe, expect, it, vi } from "vitest";
import { recordPodcastAction } from "./admin.functions";

/** The podcast audit helper: it writes through staff_record, and a record that fails after the change does not undo it. */
const context = (rpc: ReturnType<typeof vi.fn>) =>
  ({ supabaseAdmin: { rpc }, userId: "u1", staffRole: "support" }) as never;

describe("recordPodcastAction", () => {
  it("writes one staff_record row with the actor, role, action and ids", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 5, error: null });
    await recordPodcastAction(context(rpc), "podcast.folder.delete", { folderId: "f1" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe("staff_record");
    expect(rpc.mock.calls[0]![1]).toMatchObject({
      p_actor: "u1",
      p_role: "support",
      p_action: "podcast.folder.delete",
      p_target: null,
      p_after: { folderId: "f1" },
    });
  });

  it("a record that cannot be written is logged, not thrown (the change is already committed)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "down" } });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordPodcastAction(context(rpc), "podcast.episode.publish", { episodeId: "e1" }),
    ).resolves.toBeUndefined();
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).toContain("audit_write_failed");
    expect(line).toContain("podcast.episode.publish");
    expect(line).toContain("e1");
    logged.mockRestore();
  });

  it("a thrown error from the client is logged the same way", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordPodcastAction(context(rpc), "podcast.folder.create", { folderId: "f2" }),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
