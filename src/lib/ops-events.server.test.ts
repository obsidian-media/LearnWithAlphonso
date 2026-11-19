import { afterEach, describe, expect, it, vi } from "vitest";
import { opsEventRow, recordOpsEventWith, type OpsEventsDb } from "./ops-events.server";

afterEach(() => vi.restoreAllMocks());

const dbWith = (insert: (row: unknown) => PromiseLike<{ error: { message: string } | null }>) =>
  (async () => ({ from: () => ({ insert }) })) as () => Promise<OpsEventsDb>;

describe("recordOpsEventWith", () => {
  it("writes the event row with source, user and detail", async () => {
    const rows: unknown[] = [];
    await recordOpsEventWith(
      dbWith(async (r) => {
        rows.push(r);
        return { error: null };
      }),
      "hearts_settlement_failed",
      { fn: "completeLessonRemote" },
      "u1",
      "web",
    );
    expect(rows).toEqual([
      {
        event: "hearts_settlement_failed",
        source: "web",
        user_id: "u1",
        detail: { fn: "completeLessonRemote" },
      },
    ]);
  });

  it("never throws or rejects when the write errors, throws, rejects or the client cannot be made", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordOpsEventWith(
        dbWith(async () => ({ error: { message: "denied" } })),
        "e",
      ),
    ).resolves.toBeUndefined();
    await expect(
      recordOpsEventWith(
        dbWith(() => {
          throw new Error("boom");
        }),
        "e",
      ),
    ).resolves.toBeUndefined();
    await expect(
      recordOpsEventWith(
        dbWith(() => Promise.reject(new Error("rejected"))),
        "e",
      ),
    ).resolves.toBeUndefined();
    await expect(
      recordOpsEventWith(async () => {
        throw new Error("no service key");
      }, "e"),
    ).resolves.toBeUndefined();
  });

  it("does not wait for a hanging write beyond the timeout", async () => {
    vi.useFakeTimers();
    try {
      let done = false;
      const p = recordOpsEventWith(
        dbWith(() => new Promise(() => {})),
        "e",
        {},
        null,
        "web",
        500,
      ).then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(499);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      await p;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a name the table would reject, without touching the database", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    await recordOpsEventWith(dbWith(insert), "Not Valid!");
    expect(insert).not.toHaveBeenCalled();
    expect(opsEventRow("a".repeat(65), {}, null, "web")).toBeNull();
  });
});
