// Deno-side quota/rate-limit check, shared by grade-review and
// complete-lesson -- both call deriveAnswerCorrectness's "translate"
// branch, which is the one AI-cost path in this app that had no quota
// enforcement at all (2026-09-29 codebase audit finding; see
// answer-correctness.ts's doc comment on that branch for why the previous
// "an item must be due" reasoning didn't actually hold).
//
// Calls the same consume_ai_rate_limit/consume_ai_quota RPCs
// src/lib/ai-quota.server.ts uses on the web side, against a client
// carrying the CALLER's own JWT (not the admin/service-role client) --
// both RPCs are SECURITY DEFINER and resolve auth.uid() from that JWT,
// same requirement as the web helper's own doc comment.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a closure that atomically consumes one unit of the caller's
 * "translate" quota when called, or false if the per-minute or daily cap
 * is already spent. Pass as deriveAnswerCorrectness's checkQuota.
 */
export function makeTranslateQuotaCheck(userClient: SupabaseClient): () => Promise<boolean> {
  return async () => {
    // Burst limit first, same ordering as the web helper -- a rejected
    // burst should not also eat into the day's quota.
    const { data: rlData } = await userClient.rpc("consume_ai_rate_limit", { _kind: "translate" });
    const rlRow = Array.isArray(rlData) ? rlData[0] : rlData;
    if (!rlRow?.allowed) return false;

    const { data: quotaData } = await userClient.rpc("consume_ai_quota", { _kind: "translate" });
    const quotaRow = Array.isArray(quotaData) ? quotaData[0] : quotaData;
    return !!quotaRow?.allowed;
  };
}
