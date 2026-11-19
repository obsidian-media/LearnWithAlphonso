import type { EmailMessage } from "./report-notify.server";
import { OPS_ALERT_COOLDOWN_MS, thresholdFor } from "./ops-events-config";

/**
 * The owner alert for operational events (20261125140000_ops_events.sql), run from the 15-minute maintenance sweep.
 * When an event's count in the last hour reaches its alertPerHour (src/lib/ops-events-config.ts) the owner is emailed,
 * at most once per event per 24 hours: the last alert time is kept in ops_event_alerts and CLAIMED before sending
 * (insert, or a compare-and-swap update), so two overlapping sweeps cannot both send.
 *
 * Failure rules, as the AI spend alert: a failed send releases the claim so the next pass retries; a missing
 * recipient or sender is logged and skipped without claiming; a database without the objects yet skips quietly.
 * The email carries event names and counts only.
 */
type Res<T> = PromiseLike<{ data: T; error: { message: string; code?: string } | null }>;
export type OpsAlertDb = {
  rpc: (fn: string) => Res<unknown>;
  from: (table: "ops_event_alerts") => {
    select: (cols: string) => {
      eq: (col: string, v: string) => { maybeSingle: () => Res<{ last_alert_at: string } | null> };
    };
    insert: (row: { event: string; last_alert_at: string }) => PromiseLike<{
      error: { message: string; code?: string } | null;
    }>;
    update: (row: { last_alert_at: string }) => {
      eq: (
        col: string,
        v: string,
      ) => {
        eq: (
          col: string,
          v: string,
        ) => {
          select: (cols: string) => Res<{ event: string }[] | null>;
        };
      };
    };
    delete: () => { eq: (col: string, v: string) => PromiseLike<unknown> };
  };
};
export type OpsAlertDeps = {
  db: OpsAlertDb;
  now: () => Date;
  send: (msg: EmailMessage) => Promise<void>;
  ownerEmail: string;
  from: string;
};
export type OpsAlertResult = { alerted: string[]; skipped: boolean };

type Summary = { event: string; count_1h: number; count_24h: number };

const notDeployed = (e: { message: string; code?: string }) =>
  e.code === "PGRST202" ||
  e.code === "PGRST205" ||
  e.code === "42883" ||
  e.code === "42P01" ||
  /could not find|does not exist/i.test(e.message);

export async function sweepOpsAlerts(deps: OpsAlertDeps): Promise<OpsAlertResult> {
  const result: OpsAlertResult = { alerted: [], skipped: false };
  const { data, error } = await deps.db.rpc("ops_events_summary");
  if (error) {
    if (!notDeployed(error)) throw new Error(`could not read event counts: ${error.message}`);
    return result;
  }
  const over = ((data as Summary[] | null) ?? []).filter(
    (r) => Number(r.count_1h) >= thresholdFor(r.event).alertPerHour,
  );
  if (over.length === 0) return result;
  if (!deps.ownerEmail || !deps.from) {
    console.error("[ops-alert] events crossed their threshold but no owner email or sender is set");
    result.skipped = true;
    return result;
  }

  const nowIso = deps.now().toISOString();
  const claimed: { row: Summary; previous: string | null }[] = [];
  for (const row of over) {
    const { data: prev, error: readError } = await deps.db
      .from("ops_event_alerts")
      .select("last_alert_at")
      .eq("event", row.event)
      .maybeSingle();
    if (readError) {
      if (!notDeployed(readError)) console.error("[ops-alert] read failed:", readError.message);
      continue;
    }
    if (!prev) {
      const { error: insertError } = await deps.db
        .from("ops_event_alerts")
        .insert({ event: row.event, last_alert_at: nowIso });
      if (!insertError) claimed.push({ row, previous: null });
      continue;
    }
    if (deps.now().getTime() - new Date(prev.last_alert_at).getTime() < OPS_ALERT_COOLDOWN_MS) {
      continue;
    }
    const { data: won, error: updateError } = await deps.db
      .from("ops_event_alerts")
      .update({ last_alert_at: nowIso })
      .eq("event", row.event)
      .eq("last_alert_at", prev.last_alert_at)
      .select("event");
    if (!updateError && won && won.length === 1)
      claimed.push({ row, previous: prev.last_alert_at });
  }
  if (claimed.length === 0) return result;

  const lines = claimed.map(
    ({ row }) =>
      `- ${row.event}: ${row.count_1h} in the last hour, ${row.count_24h} in the last 24 hours`,
  );
  try {
    await deps.send({
      from: deps.from,
      to: deps.ownerEmail,
      subject: `[Alphonso] System health: ${claimed.map((c) => c.row.event).join(", ")}`,
      text: [
        "These server-side events crossed their hourly alert threshold:",
        "",
        ...lines,
        "",
        "Open the admin console, System health, for the latest rows. Thresholds: src/lib/ops-events-config.ts.",
        "Each event is reported at most once every 24 hours.",
      ].join("\n"),
    });
    result.alerted = claimed.map((c) => c.row.event);
  } catch (e) {
    console.error("[ops-alert] send failed:", e instanceof Error ? e.message : "error");
    for (const { row, previous } of claimed) {
      if (previous === null) await deps.db.from("ops_event_alerts").delete().eq("event", row.event);
      else
        await deps.db
          .from("ops_event_alerts")
          .update({ last_alert_at: previous })
          .eq("event", row.event)
          .eq("last_alert_at", nowIso)
          .select("event");
    }
  }
  return result;
}

export async function defaultOpsAlertDeps(): Promise<OpsAlertDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmailViaResend } = await import("./report-notify.server");
  return {
    db: supabaseAdmin as unknown as OpsAlertDb,
    now: () => new Date(),
    send: (m) => sendEmailViaResend(m),
    ownerEmail: process.env.REPORT_NOTIFY_TO ?? "",
    from: process.env.SUPPORT_NOTIFY_FROM ?? "",
  };
}
