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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { denoEnv, monthlyCapAllows, type MonthlyCapDeps } from "./ai-monthly-cap.ts";
import { heartsUnlimitedFor } from "./hearts-pro.ts";

/** Whether a learner has Pro, from the same lookup the hearts economy uses (cached an hour; false when unsure). */
async function defaultIsPro(userId: string): Promise<boolean> {
  const url = denoEnv("SUPABASE_URL");
  const key = denoEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return false;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  return heartsUnlimitedFor(admin, userId);
}

/**
 * Returns a closure that atomically consumes one unit of the caller's
 * "translate" quota when called, or false if the monthly AI cost cap, the
 * per-minute cap or the daily cap is already spent. Pass as
 * deriveAnswerCorrectness's checkQuota. False only means "no AI opinion"
 * (the caller keeps its local verdict).
 *
 * The monthly cost cap (ai-monthly-cap.ts, the twin of the web server's) is
 * checked first, like the web helper, so a refused call burns no burst token
 * and no daily unit. When the month's cost cannot be read a free learner is
 * refused and a Pro learner is let through.
 */
export function makeTranslateQuotaCheck(
  userClient: SupabaseClient,
  capDeps: MonthlyCapDeps = { isPro: defaultIsPro },
): () => Promise<boolean> {
  return async () => {
    if (!(await monthlyCapAllows(userClient, capDeps))) return false;

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
