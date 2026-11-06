import { nextUtcMidnight, quotaFailureResponse } from "./ai-quota-response";

/**
 * Daily voice time for /api/stt (20261105100900). The 120-calls-a-day limit counts calls; this counts what a call
 * costs: seconds of audio. Before a call the route refuses when the day's seconds are spent; after it, the route adds
 * the length the speech provider reports. Check and charge are separate steps, so a burst of parallel calls can
 * finish a little past the budget; the 10-a-minute limit and the 1 MB upload cap bound that.
 */

/** 20 minutes of transcribed speech a day, far above a day of lessons and tutor turns. */
export const DEFAULT_DAILY_AUDIO_SECONDS = 20 * 60;
/**
 * One recording. 120 s, not less: the apps do not stop a recording themselves, and Android's 96 kbps AAC reaches the
 * 1 MB upload cap at about 85 s, so a lower ceiling would start refusing recordings that work today.
 */
export const DEFAULT_MAX_CALL_SECONDS = 120;

function envSeconds(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const dailyAudioSeconds = () =>
  envSeconds("STT_DAILY_AUDIO_SECONDS", DEFAULT_DAILY_AUDIO_SECONDS);
export const maxCallSeconds = () => envSeconds("STT_MAX_CALL_SECONDS", DEFAULT_MAX_CALL_SECONDS);

type RpcResult = { data: unknown; error: { message: string } | null };
export type BudgetDb = { rpc: (fn: never, args: never) => PromiseLike<RpcResult> };
const call = (db: BudgetDb, fn: string, args: Record<string, unknown>) =>
  (db.rpc as unknown as (f: string, a: Record<string, unknown>) => PromiseLike<RpcResult>)(
    fn,
    args,
  );

/** null = go ahead. Otherwise the response to send: the same 429 the daily call limit uses, or a 500. */
export async function audioBudgetRefusal(
  db: BudgetDb,
  userId: string,
  now: Date = new Date(),
): Promise<Response | null> {
  const { data, error } = await call(db, "stt_audio_seconds_used", { _user_id: userId });
  if (error || typeof data !== "number") {
    return Response.json({ error: "Could not verify your usage." }, { status: 500 });
  }
  const budget = dailyAudioSeconds();
  if (data < budget) return null;
  return quotaFailureResponse({
    status: 429,
    message: `Daily voice time limit reached (${Math.round(budget / 60)} min/day). Try again tomorrow.`,
    resetsAt: nextUtcMidnight(now),
  });
}

/** Whole seconds to charge: the provider's length rounded up, or the per-call maximum when it gives none. */
export function chargeableSeconds(providerDuration: unknown): number {
  if (
    typeof providerDuration === "number" &&
    Number.isFinite(providerDuration) &&
    providerDuration >= 0
  ) {
    return Math.ceil(providerDuration);
  }
  return maxCallSeconds();
}

/** Never throws: the learner already has the transcript, and a failed write must not take it away. */
export async function chargeAudioSeconds(db: BudgetDb, userId: string, seconds: number) {
  try {
    const { error } = await call(db, "add_stt_audio_seconds", {
      _user_id: userId,
      _seconds: seconds,
    });
    if (error) console.error("[stt] could not record voice time:", error.message);
  } catch (e) {
    console.error("[stt] could not record voice time:", e instanceof Error ? e.message : e);
  }
}
