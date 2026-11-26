// The send step of send-push, apart from the HTTP handling so a test can drive it with fakes.
//
// A push that fails to reach a device (not a dead token: those are pruned) used to leave no trace anywhere, so a
// "my friend never got my nudge" report could not be checked. When any send fails, one ops_events row is written
// (counts only), which the admin System health page shows and the maintenance sweep alerts on.
import { recordOpsEvent } from "../_shared/ops-events.ts";
import type { SendPushResult } from "../_shared/apns.ts";

type Admin = Parameters<typeof recordOpsEvent>[0];

export type SendPush = (
  admin: never,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
) => Promise<SendPushResult>;

/** Sends, then records the failure count when it is above zero. Never throws on the recording. */
export async function deliverPush(
  send: SendPush,
  admin: Admin,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<SendPushResult> {
  const result = await send(admin as never, userId, title, body, data);
  const failed = result.failed ?? 0;
  if (failed > 0) {
    await recordOpsEvent(admin, "send-push", "push_send_failed", { failed, sent: result.sent }, userId);
  }
  return result;
}
