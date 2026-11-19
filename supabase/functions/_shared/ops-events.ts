// Edge twin of the web recorder (src/lib/ops-events.server.ts, 20261125140000_ops_events.sql). Writes one row for a
// server-side failure so the owner can see it. Never throws and never waits longer than the timeout: a failure to
// record must not fail or slow a lesson save. detail = ids, codes and counts only (no free text, no PII).
// A structural type, not the supabase-js one: the Deno test job cannot resolve that package.
type OpsAdmin = {
  from: (table: string) => {
    // deno-lint-ignore no-explicit-any
    insert: (row: any) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export const OPS_EVENT_TIMEOUT_MS = 2000;
/** Events that fire on a SUCCESSFUL save (the shadow settlements): a degraded database may add at most this much. */
export const OPS_EVENT_SUCCESS_PATH_TIMEOUT_MS = 500;
const OPS_EVENT_NAME = /^[a-z0-9_]{1,64}$/;

export async function recordOpsEvent(
  admin: OpsAdmin,
  source: string,
  event: string,
  detail: Record<string, string | number | boolean | null> = {},
  userId: string | null = null,
  timeoutMs = OPS_EVENT_TIMEOUT_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!OPS_EVENT_NAME.test(event)) return;
    const write = (async () => {
      const { error } = await admin
        .from("ops_events")
        .insert({ event, source: source.slice(0, 64), user_id: userId, detail });
      if (error) console.error("[ops-events] write failed:", error.message);
    })();
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
