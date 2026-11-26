import { describe, expect, it, vi } from "vitest";
import {
  REHEARSAL_FINISH_MIN_REPLIES,
  finishMinReplies,
  recordRehearsalReply,
  starsForRow,
  type CallRow,
} from "./practice-calls.server";
import { STAR_RULE } from "./practice-stars";

const REHEARSAL = "00000000-0000-4000-8000-0000000000d1";
const CALL = "00000000-0000-4000-8000-0000000000c1";

describe("finishMinReplies", () => {
  it("a rehearsal run needs 4 replies, whatever the stage", () => {
    expect(REHEARSAL_FINISH_MIN_REPLIES).toBe(4);
    for (const stage of ["warmup", "conversation", "hard_moments"])
      expect(finishMinReplies("rehearsal", `${REHEARSAL}:${stage}`)).toBe(4);
  });
  it("a rehearsal key with an unknown stage or shape is not a finishable item", () => {
    expect(finishMinReplies("rehearsal", `${REHEARSAL}:bogus`)).toBeNull();
    expect(finishMinReplies("rehearsal", "coffee")).toBeNull();
    expect(finishMinReplies("rehearsal", `not-a-uuid:warmup`)).toBeNull();
  });
  it("scenarios and scenes are unchanged", () => {
    expect(finishMinReplies("scenario", "coffee")).toBe(STAR_RULE.scenarioFinishMinReplies);
    expect(finishMinReplies("scene", "no-such/scene")).toBeNull();
  });
});

describe("starsForRow", () => {
  const row = (replies: number): CallRow => ({
    id: CALL,
    user_id: "u1",
    course: "en",
    kind: "rehearsal",
    item_key: `${REHEARSAL}:conversation`,
    replies,
    right_replies: replies,
    short_replies: 0,
    english_replies: 0,
    started_at: "2026-11-26T10:00:00Z",
    last_reply_at: "2026-11-26T10:05:00Z",
    finished_at: null,
  });
  it("earns nothing under the rehearsal floor (3 replies is a scenario's finish, not a rehearsal's)", () => {
    expect(starsForRow(row(3))).toBe(0);
    expect(starsForRow(row(4))).toBeGreaterThanOrEqual(1);
  });
});

describe("recordRehearsalReply", () => {
  const rpc = vi.fn();
  const client = { rpc };
  const params = {
    userId: "u1",
    callId: CALL,
    rehearsalId: REHEARSAL,
    stage: "conversation" as const,
    course: "fr" as const,
    learnerText: "Bonjour, je voudrais postuler pour le poste.",
    verdict: "correct" as const,
  };

  it("records a rehearsal-kind reply under '<rehearsal id>:<stage>' in the rehearsal's own course", async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: 1, error: null });
    expect(await recordRehearsalReply(client, params)).toBe(true);
    const call = rpc.mock.calls.find((c) => c[0] === "record_practice_reply")!;
    expect(call[1]).toMatchObject({
      _user_id: "u1",
      _call_id: CALL,
      _course: "fr",
      _kind: "rehearsal",
      _item_key: `${REHEARSAL}:conversation`,
      _right: true,
    });
  });

  it("records nothing for a bad call id, and never throws when the database fails", async () => {
    rpc.mockReset();
    expect(await recordRehearsalReply(client, { ...params, callId: "nope" })).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockRejectedValue(new Error("down"));
    expect(await recordRehearsalReply(client, params)).toBe(false);
    rpc.mockResolvedValue({ data: null, error: { message: "refused" } });
    expect(await recordRehearsalReply(client, params)).toBe(false);
  });
});
