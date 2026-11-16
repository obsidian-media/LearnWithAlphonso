import { llmEntry, toRow, type AiCostEntry, type AiCostKind } from "./ai-cost";

/**
 * The AI cost log's writer (20261118200000_ai_cost_log.sql). One row per billable AI call, written with the service
 * role (the table has no client grants).
 *
 * The one rule: a failed or slow write must never cost a learner their answer. Every function here catches
 * everything, logs a short line, and resolves; the callers do not await it on the answer's path (they hand it to
 * scheduleBackground, or fold it into a wait that already exists).
 */

type InsertResult = PromiseLike<{ error: { message: string; code?: string } | null }>;
export type CostLogDb = {
  from: (table: "ai_cost_log") => { insert: (row: unknown) => InsertResult };
};

/** A write that has not finished by then is abandoned (the row is lost, the learner is not kept waiting). */
export const COST_LOG_TIMEOUT_MS = 4_000;

let warnedNotDeployed = false;
/** Tests only. */
export function resetCostLogWarnings(): void {
  warnedNotDeployed = false;
}

/** The migration is applied when the web app deploys; until then PostgREST says the table does not exist. */
const notDeployedYet = (e: { message: string; code?: string }) =>
  e.code === "42P01" || e.code === "PGRST205";

export async function recordAiCost(entry: AiCostEntry, db?: CostLogDb): Promise<void> {
  try {
    const admin =
      db ??
      ((await import("@/integrations/supabase/client.server"))
        .supabaseAdmin as unknown as CostLogDb);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), COST_LOG_TIMEOUT_MS);
    });
    try {
      const outcome = await Promise.race([
        Promise.resolve(admin.from("ai_cost_log").insert(toRow(entry))),
        timeout,
      ]);
      if (outcome === "timeout") {
        console.error("[ai-cost] write timed out; one row lost");
      } else if (outcome.error) {
        if (notDeployedYet(outcome.error)) {
          if (!warnedNotDeployed) {
            warnedNotDeployed = true;
            console.error("[ai-cost] ai_cost_log is not deployed yet; rows are not being kept");
          }
        } else {
          console.error("[ai-cost] write failed:", outcome.error.message);
        }
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (e) {
    console.error("[ai-cost] write failed:", e instanceof Error ? e.message : "error");
  }
}

type RequestContext = { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined };

/**
 * Lets `work` finish after the response has gone out. On Vercel the platform keeps the invocation alive for a promise
 * registered with waitUntil (the same hook @vercel/functions wraps, read from the request context it publishes, so no
 * dependency is added). Anywhere else (tests, local dev) the promise simply runs on. Never throws.
 */
export function scheduleBackground(work: Promise<unknown>): void {
  const settled = work.catch(() => undefined);
  try {
    const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
      RequestContext | undefined;
    ctx?.get?.()?.waitUntil?.(settled);
  } catch {
    // No request context: the promise runs on its own.
  }
}

/** Where a call came from; passed to llmChatCompletion so the reply it returns is also measured. */
export type LlmTrack = { userId: string; kind: AiCostKind };

/**
 * Reads the usage out of a COPY of a successful chat completion and logs it. The caller's own Response is untouched
 * and read normally. Anything that goes wrong is swallowed.
 */
export async function recordLlmCost(
  copy: Response,
  track: LlmTrack,
  requestedModel: string,
  db?: CostLogDb,
): Promise<void> {
  try {
    const body: unknown = await copy.json();
    await recordAiCost(llmEntry(track, requestedModel, body), db);
  } catch {
    console.error("[ai-cost] could not read a model reply's usage; one row lost");
  }
}
