import type { SupabaseClient } from "@supabase/supabase-js";
import { KNOWN_OPS_EVENTS, opsStatus, type OpsStatus } from "./ops-events-config";

/** The System health read (service role). Counts per event plus the latest rows. Detail is ids, codes and counts. */
export type OpsHealthRow = {
  event: string;
  count24h: number;
  count7d: number;
  lastAt: string | null;
  status: OpsStatus;
};
export type OpsLatest = {
  id: number;
  event: string;
  source: string;
  userId: string | null;
  detail: unknown;
  createdAt: string;
};
export type OpsHealth = { events: OpsHealthRow[]; latest: OpsLatest[] };

type Summary = {
  event: string;
  count_1h: number;
  count_24h: number;
  count_7d: number;
  last_at: string | null;
};

export async function readOpsHealth(db: SupabaseClient): Promise<OpsHealth> {
  const untyped = db as unknown as {
    rpc: (fn: string) => PromiseLike<{ data: Summary[] | null; error: { message: string } | null }>;
    from: (t: string) => {
      select: (c: string) => {
        order: (
          c: string,
          o: { ascending: boolean },
        ) => {
          limit: (n: number) => PromiseLike<{
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const [sum, latest] = await Promise.all([
    untyped.rpc("ops_events_summary"),
    untyped
      .from("ops_events")
      .select("id, event, source, user_id, detail, created_at")
      .order("id", { ascending: false })
      .limit(50),
  ]);
  if (sum.error) throw new Error(`could not read event counts: ${sum.error.message}`);
  if (latest.error) throw new Error(`could not read events: ${latest.error.message}`);
  const byEvent = new Map((sum.data ?? []).map((r) => [r.event, r]));
  const names = [...new Set([...KNOWN_OPS_EVENTS, ...byEvent.keys()])];
  const events = names
    .map((event): OpsHealthRow => {
      const r = byEvent.get(event);
      const count24h = Number(r?.count_24h ?? 0);
      return {
        event,
        count24h,
        count7d: Number(r?.count_7d ?? 0),
        lastAt: r?.last_at ?? null,
        status: opsStatus(event, count24h),
      };
    })
    .sort((a, b) => b.count24h - a.count24h || a.event.localeCompare(b.event));
  return {
    events,
    latest: (latest.data ?? []).map((r) => ({
      id: Number(r.id),
      event: String(r.event),
      source: String(r.source),
      userId: typeof r.user_id === "string" ? r.user_id : null,
      detail: r.detail,
      createdAt: String(r.created_at),
    })),
  };
}
