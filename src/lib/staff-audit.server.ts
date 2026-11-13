import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffRole } from "./staff-scopes";

/**
 * Every console WRITE function. staff-registry.test.ts checks that each one records its action (through
 * recordStaffAction or a staff_* SQL function that writes the record in the same transaction).
 */
export const STAFF_WRITE_FUNCTIONS = [
  "staffAddNote",
  "staffGrantPro",
  "staffRevokePro",
  "staffBlockUser",
  "staffUnblockUser",
  "staffBanUser",
  "staffUnbanUser",
  "staffDeleteUser",
  "staffAddStaff",
  "staffUpdateStaff",
] as const;

export const REASON_MESSAGE = "A reason (3-500 characters) is required.";

/** The reason every write action must carry: trimmed, 3 to 500 characters. */
export function validateReason(reason: unknown): string {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < 3 || text.length > 500) throw new Error(REASON_MESSAGE);
  return text;
}

export type StaffActionInput = {
  actor: string;
  role: StaffRole;
  action: string;
  target: string | null;
  reason: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string;
};

/**
 * Writes one row to the append-only action record through staff_record. Throws when the row could not be written:
 * a caller that has already changed something must not carry on as if it had been recorded. (For changes the
 * database makes itself, prefer the staff_* functions that record in the same transaction.)
 */
export async function recordStaffAction(
  client: SupabaseClient,
  input: StaffActionInput,
): Promise<number> {
  const { data, error } = await client.rpc("staff_record", {
    p_actor: input.actor,
    p_role: input.role,
    p_action: input.action,
    p_target: input.target,
    p_reason: input.reason,
    p_before: input.before ?? null,
    p_after: input.after ?? null,
    p_request_id: input.requestId ?? null,
  } as never);
  if (error || typeof data !== "number") {
    throw new Error("Could not write the action record; nothing further was done.");
  }
  return data;
}

/** A look at a learner's account (scope users.read) is recorded too, with no reason required. */
export function recordUserView(
  client: SupabaseClient,
  input: { actor: string; role: StaffRole; target: string; requestId?: string },
): Promise<number> {
  return recordStaffAction(client, {
    actor: input.actor,
    role: input.role,
    action: "user.view",
    target: input.target,
    reason: null,
    requestId: input.requestId,
  });
}
