/**
 * The operational-event recorder (20261125140000_ops_events.sql). Server-side failures that used to be one console line
 * nobody reads are also written as a row, so the System health page and the owner alert can see them.
 *
 * Rules: fire-and-forget with a short timeout, and NOTHING here may throw or hold up the caller (a lesson save must
 * never fail or slow down because an event could not be recorded). `detail` carries ids, codes and counts only: no
 * free text, no email, no answer content. The console line stays at the call site.
 */
export const OPS_EVENT_TIMEOUT_MS = 2000;
/** Events that fire on a SUCCESSFUL save (the shadow settlements): a degraded database may add at most this much. */
export const OPS_EVENT_SUCCESS_PATH_TIMEOUT_MS = 500;

type InsertResult = PromiseLike<{ error: { message: string } | null }>;
export type OpsEventsDb = {
  from: (table: "ops_events") => { insert: (row: unknown) => InsertResult };
};

const OPS_EVENT_NAME = /^[a-z0-9_]{1,64}$/;

/** The row for an event, or null when the name is not acceptable. Pure. */
export function opsEventRow(
  event: string,
  detail: Record<string, string | number | boolean | null>,
  userId: string | null,
  source: string,
) {
  if (!OPS_EVENT_NAME.test(event)) return null;
  return { event, source: source.slice(0, 64), user_id: userId, detail };
}

/** Core with an injectable client. Never rejects; resolves once the write finished, failed or timed out. */
export async function recordOpsEventWith(
  getDb: () => Promise<OpsEventsDb>,
  event: string,
  detail: Record<string, string | number | boolean | null> = {},
  userId: string | null = null,
  source = "web",
  timeoutMs = OPS_EVENT_TIMEOUT_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const row = opsEventRow(event, detail, userId, source);
    if (!row) return;
    const write = (async () => {
      const db = await getDb();
      const { error } = await db.from("ops_events").insert(row);
      if (error) console.error("[ops-events] write failed:", error.message);
    })();
    // A write that loses the race still runs; its late rejection is swallowed so it can never go unhandled.
    write.catch(() => {});
    await Promise.race([
      write,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch (e) {
    console.error("[ops-events] write failed:", e instanceof Error ? e.message : "error");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Record an event with the service-role client. Call it as `void recordOpsEvent(...)` where the caller does not wait,
 * or await it where a request would otherwise end before the write goes out (it is bounded by the timeout).
 */
export function recordOpsEvent(
  event: string,
  detail: Record<string, string | number | boolean | null> = {},
  userId: string | null = null,
  timeoutMs = OPS_EVENT_TIMEOUT_MS,
): Promise<void> {
  return recordOpsEventWith(
    async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return supabaseAdmin as unknown as OpsEventsDb;
    },
    event,
    detail,
    userId,
    "web",
    timeoutMs,
  );
}
