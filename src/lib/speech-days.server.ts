/**
 * Minutes spoken (20261106100000_speech_days.sql): seconds of the learner's own transcribed speech per UTC day.
 *
 * /api/stt is the one server path that transcribes learner speech, so it is the one writer. It records only a
 * successful transcription: a readable 2xx answer that reports the audio's length and has a non-empty transcript.
 * The seconds are the settled length the voice time budget charges (the provider's length rounded up), never the
 * reserved per-call maximum.
 */

type RpcError = { message: string; code?: string };
type RpcResult = { data: unknown; error: RpcError | null };
export type SpeechDb = { rpc: (fn: never, args: never) => PromiseLike<RpcResult> };

/** The most one call may add; add_speech_seconds refuses more (20261106100000). */
export const MAX_SPEECH_SECONDS_PER_CALL = 3600;

/**
 * Seconds to record for one transcription, or null when nothing should be recorded: no length from the provider
 * (the budget then keeps its per-call maximum, which is a ceiling, not speech), or no words were recognised.
 */
export function spokenSeconds(providerDuration: unknown, transcript: string): number | null {
  if (
    typeof providerDuration !== "number" ||
    !Number.isFinite(providerDuration) ||
    providerDuration <= 0
  ) {
    return null;
  }
  if (transcript.trim() === "") return null;
  return Math.min(Math.ceil(providerDuration), MAX_SPEECH_SECONDS_PER_CALL);
}

/**
 * The web app deploys at the same moment the migrations are applied, so for a few minutes the function may not exist
 * yet (PGRST202 from PostgREST, 42883 from Postgres): skip quietly then.
 */
const notDeployedYet = (e: RpcError) => e.code === "PGRST202" || e.code === "42883";

/** Adds `seconds` to today's total. Never throws: a failed write must not cost the learner their answer. */
export async function recordSpeechSeconds(db: SpeechDb, userId: string, seconds: number | null) {
  if (seconds === null || seconds <= 0) return;
  try {
    const { error } = await (
      db.rpc as unknown as (f: string, a: Record<string, unknown>) => PromiseLike<RpcResult>
    )("add_speech_seconds", { _user_id: userId, _seconds: seconds });
    if (error && !notDeployedYet(error)) {
      console.error("[stt] could not record speech seconds:", error.message);
    }
  } catch (e) {
    console.error("[stt] could not record speech seconds:", e instanceof Error ? e.message : e);
  }
}
