import { describe, expect, it, vi } from "vitest";
import {
  recordStaffAction,
  recordUserView,
  STAFF_WRITE_FUNCTIONS,
  validateReason,
} from "./staff-audit.server";

const REASON_MESSAGE = "A reason (3-500 characters) is required.";

describe("validateReason", () => {
  it("rejects empty, 2-char and 501-char reasons", () => {
    expect(() => validateReason("")).toThrow(REASON_MESSAGE);
    expect(() => validateReason("   ")).toThrow(REASON_MESSAGE);
    expect(() => validateReason(" ab ")).toThrow(REASON_MESSAGE);
    expect(() => validateReason("x".repeat(501))).toThrow(REASON_MESSAGE);
    expect(() => validateReason(undefined)).toThrow(REASON_MESSAGE);
    expect(() => validateReason(42)).toThrow(REASON_MESSAGE);
  });
  it("accepts 3 and 500 characters and returns the trimmed text", () => {
    expect(validateReason("  abc  ")).toBe("abc");
    expect(validateReason("x".repeat(500))).toHaveLength(500);
  });
});

describe("recordStaffAction", () => {
  const client = (result: { data: unknown; error: unknown }) => {
    const rpc = vi.fn(async () => result);
    return { rpc, client: { rpc } as never };
  };

  it("passes all fields to staff_record and returns the row id", async () => {
    const { rpc, client: c } = client({ data: 42, error: null });
    const id = await recordStaffAction(c, {
      actor: "a",
      role: "support",
      action: "user.block",
      target: "t",
      reason: "because",
      before: { x: 1 },
      after: { x: 2 },
      requestId: "req-1",
    });
    expect(id).toBe(42);
    expect(rpc).toHaveBeenCalledWith("staff_record", {
      p_actor: "a",
      p_role: "support",
      p_action: "user.block",
      p_target: "t",
      p_reason: "because",
      p_before: { x: 1 },
      p_after: { x: 2 },
      p_request_id: "req-1",
    });
  });

  it("sends null for the optional fields", async () => {
    const { rpc, client: c } = client({ data: 1, error: null });
    await recordStaffAction(c, {
      actor: "a",
      role: "owner",
      action: "x",
      target: null,
      reason: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      "staff_record",
      expect.objectContaining({
        p_target: null,
        p_reason: null,
        p_before: null,
        p_after: null,
        p_request_id: null,
      }),
    );
  });

  it("throws when the record could not be written (never silent)", async () => {
    const { client: c } = client({ data: null, error: { message: "boom" } });
    await expect(
      recordStaffAction(c, { actor: "a", role: "owner", action: "x", target: null, reason: null }),
    ).rejects.toThrow(/action record/i);
  });

  it("a read of a learner (users.read) records action user.view with no reason required", async () => {
    const { rpc, client: c } = client({ data: 7, error: null });
    await recordUserView(c, { actor: "a", role: "support", target: "t" });
    expect(rpc).toHaveBeenCalledWith(
      "staff_record",
      expect.objectContaining({ p_action: "user.view", p_reason: null, p_target: "t" }),
    );
  });
});

describe("STAFF_WRITE_FUNCTIONS", () => {
  it("lists every write function exactly once", () => {
    expect(new Set(STAFF_WRITE_FUNCTIONS).size).toBe(STAFF_WRITE_FUNCTIONS.length);
    expect(STAFF_WRITE_FUNCTIONS.length).toBeGreaterThan(0);
  });
});
