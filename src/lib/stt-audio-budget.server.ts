import { nextUtcMidnight, quotaFailureResponse } from "./ai-quota-response";

/**
 * Daily voice time for /api/stt (20261105100900). The 120-calls-a-day limit counts calls; this counts what a call
 * costs: seconds of audio.
 *
 * Before the provider call the route RESERVES the per-call maximum, atomically and only if the day's total stays within
 * the budget, so parallel calls cannot overrun it. Afterwards it SETTLES the reservation to the length the provider
 * reports. A timeout or an unreadable success answer keeps the reservation (the provider had the audio); a provider that
 * could not be reached, or that answered with an error, is refunded in full.
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

type RpcError = { message: string; code?: string };
type RpcResult = { data: unknown; error: RpcError | null };
export type BudgetDb = { rpc: (fn: never, args: never) => PromiseLike<RpcResult> };
const call = (db: BudgetDb, fn: string, args: Record<string, unknown>) =>
  (db.rpc as unknown as (f: string, a: Record<string, unknown>) => PromiseLike<RpcResult>)(
    fn,
    args,
  );

/**
 * The web app deploys at the same moment the migrations are applied, so for a few minutes this code can run against a
 * database without the budget functions. PostgREST reports that as PGRST202, Postgres as 42883.
 */
const notDeployedYet = (e: RpcError) => e.code === "PGRST202" || e.code === "42883";
let warnedNotDeployed = false;

/** The day the seconds were booked on and how many; null when the budget is not in force (not deployed yet). */
export type Reservation = { day: string; seconds: number } | null;

export async function reserveAudioSeconds(
  db: BudgetDb,
  userId: string,
  now: Date = new Date(),
): Promise<{ ok: true; reservation: Reservation } | { ok: false; response: Response }> {
  const seconds = maxCallSeconds();
  const budget = dailyAudioSeconds();
  const { data, error } = await call(db, "reserve_stt_audio_seconds", {
    _user_id: userId,
    _seconds: seconds,
    _budget: budget,
  });
  if (error) {
    if (notDeployedYet(error)) {
      if (!warnedNotDeployed) {
        warnedNotDeployed = true;
        console.warn("[stt] voice time budget not in the database yet; serving without it");
      }
      return { ok: true, reservation: null };
    }
    return {
      ok: false,
      response: Response.json({ error: "Could not verify your usage." }, { status: 500 }),
    };
  }
  if (typeof data !== "string") {
    return {
      ok: false,
      response: quotaFailureResponse({
        status: 429,
        message: `Daily voice time limit reached (${Math.round(budget / 60)} min/day). Try again tomorrow.`,
        resetsAt: nextUtcMidnight(now),
      }),
    };
  }
  return { ok: true, reservation: { day: data, seconds } };
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

/** Moves a reservation to `actualSeconds` (0 = full refund). Never throws: a failed write must not cost the answer. */
export async function settleAudioSeconds(
  db: BudgetDb,
  userId: string,
  reservation: Reservation,
  actualSeconds: number,
) {
  if (!reservation || actualSeconds === reservation.seconds) return;
  try {
    const { error } = await call(db, "settle_stt_audio_seconds", {
      _user_id: userId,
      _day: reservation.day,
      _reserved: reservation.seconds,
      _actual: actualSeconds,
    });
    if (error) console.error("[stt] could not settle voice time:", error.message);
  } catch (e) {
    console.error("[stt] could not settle voice time:", e instanceof Error ? e.message : e);
  }
}
