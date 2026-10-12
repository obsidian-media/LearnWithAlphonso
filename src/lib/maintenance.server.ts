import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AppleConfig } from "./apple-revocation";
import type { RevenueCatConfig } from "./revenuecat-entitlement";
import {
  REPORT_NOTIFY_HEADER,
  sendEmailViaResend,
  type EmailMessage,
} from "./report-notify.server";
import { MIN_SHARED_SECRET_LENGTH, secretMatches } from "./shared-secret.server";

/**
 * The scheduled maintenance pass. Called every 15 minutes by the database (run_maintenance_sweep in
 * supabase/migrations/20261015100000_maintenance_sweep.sql) through pg_net, never by a client, and authenticated
 * with the same shared secret as the report notification route.
 *
 * It does four things, each on its own so one failing does not stop the others:
 *   1. Retries Sign in with Apple revocations that failed when an account was deleted.
 *   2. Emails the owner about reports whose first notification never went out.
 *   3. Emails the owner once about reports still unresolved near the 24-hour response window.
 *   4. Retries RevenueCat subscriber erasures that failed when an account was deleted.
 */
type Admin = SupabaseClient<Database>;

/** A parked credential is retried for this long, then removed and reported to the owner. */
export const REVOCATION_RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** The insert trigger sends the first email at once; the sweep only picks up a report it has had time to miss. */
export const UNDELIVERED_AFTER_MS = 10 * 60 * 1000;
/** Reports must be answered within 24 hours; the reminder leaves time to act. */
export const OVERDUE_AFTER_MS = 20 * 60 * 60 * 1000;
/** A failed RevenueCat erase is retried for this long, then handed to the owner by email. */
export const ERASURE_RETRY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH = 20;

export type MaintenanceDeps = {
  db: Admin;
  now: () => Date;
  send: (msg: EmailMessage) => Promise<void>;
  appleConfig: () => AppleConfig | null;
  revoke: (config: AppleConfig, refreshToken: string) => Promise<boolean>;
  revenueCatConfig: () => RevenueCatConfig | null;
  eraseSubscriber: (config: RevenueCatConfig, appUserId: string) => Promise<"erased" | "failed">;
  /** Where owner alerts go; empty means alerts are logged only. */
  alertTo: string;
};

export type RevocationResult = { revoked: number; stillPending: number; expired: number };

export async function retryAppleRevocations(deps: MaintenanceDeps): Promise<RevocationResult> {
  const { db } = deps;
  const { data: rows, error } = await db
    .from("apple_revocation_pending")
    .select("id, refresh_token, created_at, attempts")
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) throw new Error(`could not read pending revocations: ${error.message}`);
  const result: RevocationResult = { revoked: 0, stillPending: 0, expired: 0 };
  if (!rows || rows.length === 0) return result;

  const config = deps.appleConfig();
  const nowMs = deps.now().getTime();
  for (const row of rows) {
    const revoked = config
      ? await deps.revoke(config, row.refresh_token).catch(() => false)
      : false;
    if (revoked) {
      const { error: gone } = await db.from("apple_revocation_pending").delete().eq("id", row.id);
      if (gone) throw new Error(`could not clear a revoked credential: ${gone.message}`);
      result.revoked += 1;
    } else if (nowMs - new Date(row.created_at).getTime() >= REVOCATION_RETRY_WINDOW_MS) {
      // Not kept past the window: holding a deleted account's credential indefinitely is its own problem.
      const { error: gone } = await db.from("apple_revocation_pending").delete().eq("id", row.id);
      if (gone) throw new Error(`could not remove an expired credential: ${gone.message}`);
      result.expired += 1;
    } else {
      await db
        .from("apple_revocation_pending")
        .update({ attempts: row.attempts + 1, last_attempt_at: deps.now().toISOString() })
        .eq("id", row.id);
      result.stillPending += 1;
    }
  }

  if (!config && rows.length > 0) {
    console.error(
      "[maintenance] Apple revocations are pending but the Apple secrets are not configured",
    );
  }
  if (result.expired > 0) {
    console.error(
      `[maintenance] ${result.expired} Apple grant(s) could not be revoked within 7 days of account deletion`,
    );
    await alertOwner(deps, {
      subject: "[Alphonso] Apple sign-in grants could not be revoked",
      text: [
        `${result.expired} Sign in with Apple grant(s) could not be revoked within 7 days of the account being deleted.`,
        "",
        "The stored credentials have now been removed, so no further automatic retry is possible.",
        "Check that the Apple sign-in key and identifiers in the server configuration are still valid.",
      ].join("\n"),
    });
  }
  return result;
}

export type ErasureResult = { erased: number; stillPending: number; expired: number };

export async function retryRevenueCatErasures(deps: MaintenanceDeps): Promise<ErasureResult> {
  const { db } = deps;
  const { data: rows, error } = await db
    .from("revenuecat_erasure_pending")
    .select("app_user_id, created_at, attempts")
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) throw new Error(`could not read pending erasures: ${error.message}`);
  const result: ErasureResult = { erased: 0, stillPending: 0, expired: 0 };
  if (!rows || rows.length === 0) return result;

  const config = deps.revenueCatConfig();
  const nowMs = deps.now().getTime();
  const handedOver: string[] = [];
  for (const row of rows) {
    const outcome = config
      ? await deps.eraseSubscriber(config, row.app_user_id).catch(() => "failed" as const)
      : "failed";
    const expired = nowMs - new Date(row.created_at).getTime() >= ERASURE_RETRY_WINDOW_MS;
    if (outcome === "erased" || expired) {
      const { error: gone } = await db
        .from("revenuecat_erasure_pending")
        .delete()
        .eq("app_user_id", row.app_user_id);
      if (gone) throw new Error(`could not clear a pending erasure: ${gone.message}`);
      if (outcome === "erased") result.erased += 1;
      else {
        result.expired += 1;
        handedOver.push(row.app_user_id);
      }
    } else {
      await db
        .from("revenuecat_erasure_pending")
        .update({ attempts: row.attempts + 1, last_attempt_at: deps.now().toISOString() })
        .eq("app_user_id", row.app_user_id);
      result.stillPending += 1;
    }
  }

  if (!config) {
    console.error(
      "[maintenance] RevenueCat erasures are pending but RevenueCat is not configured on the server",
    );
  }
  if (handedOver.length > 0) {
    console.error(
      `[maintenance] ${handedOver.length} RevenueCat subscriber record(s) could not be erased within 30 days`,
    );
    // The ids go to the owner by email, which is where a person acts on them; they are not logged.
    await alertOwner(deps, {
      subject: "[Alphonso] RevenueCat subscriber records to erase by hand",
      text: [
        `${handedOver.length} subscriber record(s) could not be erased at RevenueCat within 30 days of the account being deleted.`,
        "",
        "Erase each one in the RevenueCat dashboard (Customers > search the id > Delete customer):",
        "",
        ...handedOver.map((id) => `- ${id}`),
        "",
        "They have been removed from the retry list, so this is the only notice.",
      ].join("\n"),
    });
  }
  return result;
}

type ReportRow = { id: string; kind: string; created_at: string };
export type ReportSweepResult = { delivered: number; escalated: number };

/** Control characters out: the report kind is the only stored value quoted in these emails. */
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const clean = (v: string) => v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 40);

const listLines = (reports: ReportRow[]) =>
  reports.map((r) => `- ${r.id} (${clean(r.kind)}), filed ${r.created_at}`);

export async function sweepReports(deps: MaintenanceDeps): Promise<ReportSweepResult> {
  const { db } = deps;
  const result: ReportSweepResult = { delivered: 0, escalated: 0 };
  const nowMs = deps.now().getTime();
  // Resolving a report deletes it, so every row here is still open. Oldest first.
  const { data: reports, error } = await db
    .from("content_reports")
    .select("id, kind, created_at")
    .lt("created_at", new Date(nowMs - UNDELIVERED_AFTER_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`could not read reports: ${error.message}`);
  if (!reports || reports.length === 0) return result;

  const { data: states, error: stateError } = await db
    .from("content_report_delivery")
    .select("report_id, notified_at, escalated_at, attempts")
    .in(
      "report_id",
      reports.map((r) => r.id),
    );
  if (stateError) throw new Error(`could not read report delivery state: ${stateError.message}`);
  const stateOf = new Map((states ?? []).map((s) => [s.report_id, s]));
  if (!deps.alertTo) {
    // Nowhere to send: say so loudly on every pass instead of looking healthy.
    console.error(
      `[maintenance] ${reports.length} open report(s) but REPORT_NOTIFY_TO is not configured`,
    );
    return result;
  }
  const stamp = deps.now().toISOString();

  const undelivered = reports.filter((r) => !stateOf.get(r.id)?.notified_at).slice(0, BATCH);
  if (undelivered.length > 0 && deps.alertTo) {
    let sent = true;
    try {
      await deps.send({
        to: deps.alertTo,
        subject: `[Alphonso] ${undelivered.length} report(s) waiting: first notification was not delivered`,
        text: [
          "These reports were filed but their notification email did not go out at the time:",
          "",
          ...listLines(undelivered),
          "",
          "Open the admin app's Reports page to review them. Respond within 24 hours of the filing time.",
        ].join("\n"),
      });
    } catch (e) {
      sent = false;
      console.error("[maintenance] report digest failed:", e instanceof Error ? e.message : e);
    }
    const { error: saveError } = await db.from("content_report_delivery").upsert(
      undelivered.map((r) => ({
        report_id: r.id,
        notified_at: sent ? stamp : null,
        escalated_at: stateOf.get(r.id)?.escalated_at ?? null,
        attempts: (stateOf.get(r.id)?.attempts ?? 0) + 1,
        updated_at: stamp,
      })),
      { onConflict: "report_id" },
    );
    if (saveError) throw new Error(`could not save report delivery state: ${saveError.message}`);
    if (sent) {
      result.delivered = undelivered.length;
      for (const r of undelivered) {
        stateOf.set(r.id, {
          report_id: r.id,
          notified_at: stamp,
          escalated_at: stateOf.get(r.id)?.escalated_at ?? null,
          attempts: (stateOf.get(r.id)?.attempts ?? 0) + 1,
        });
      }
    }
  }

  const overdue = reports
    .filter(
      (r) =>
        nowMs - new Date(r.created_at).getTime() >= OVERDUE_AFTER_MS &&
        !stateOf.get(r.id)?.escalated_at,
    )
    .slice(0, BATCH);
  if (overdue.length > 0 && deps.alertTo) {
    try {
      await deps.send({
        to: deps.alertTo,
        subject: `[Alphonso] ${overdue.length} report(s) still open after 20 hours`,
        text: [
          "These reports are still unresolved and are close to the 24-hour response window:",
          "",
          ...listLines(overdue),
          "",
          "Open the admin app's Reports page to act on them or dismiss them.",
        ].join("\n"),
      });
    } catch (e) {
      // Not marked: the next pass sends the reminder again.
      console.error("[maintenance] overdue reminder failed:", e instanceof Error ? e.message : e);
      return result;
    }
    const { error: saveError } = await db.from("content_report_delivery").upsert(
      overdue.map((r) => ({
        report_id: r.id,
        notified_at: stateOf.get(r.id)?.notified_at ?? null,
        escalated_at: stamp,
        attempts: stateOf.get(r.id)?.attempts ?? 0,
        updated_at: stamp,
      })),
      { onConflict: "report_id" },
    );
    if (saveError) throw new Error(`could not save report escalation state: ${saveError.message}`);
    result.escalated = overdue.length;
  }
  return result;
}

async function alertOwner(
  deps: MaintenanceDeps,
  msg: { subject: string; text: string },
): Promise<void> {
  if (!deps.alertTo) return;
  try {
    await deps.send({ to: deps.alertTo, ...msg });
  } catch (e) {
    console.error("[maintenance] owner alert failed:", e instanceof Error ? e.message : e);
  }
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function defaultDeps(): Promise<MaintenanceDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { appleConfigFromEnv, revokeAppleGrant } = await import("./apple-revocation");
  const { revenueCatConfigFromEnv, deleteRevenueCatSubscriber } =
    await import("./revenuecat-entitlement");
  return {
    db: supabaseAdmin,
    now: () => new Date(),
    send: (m) => sendEmailViaResend(m),
    appleConfig: () => appleConfigFromEnv(),
    revoke: (config, token) => revokeAppleGrant(config, token),
    revenueCatConfig: () => revenueCatConfigFromEnv(),
    eraseSubscriber: (config, id) => deleteRevenueCatSubscriber(config, id),
    alertTo: process.env.REPORT_NOTIFY_TO ?? "",
  };
}

export async function handleMaintenance(
  request: Request,
  makeDeps: () => Promise<MaintenanceDeps> = defaultDeps,
): Promise<Response> {
  const expected = process.env.REPORT_NOTIFY_SECRET ?? "";
  if (expected.length < MIN_SHARED_SECRET_LENGTH) {
    console.error("[maintenance] REPORT_NOTIFY_SECRET (32+ chars) is not configured");
    return json({ error: "not-configured" }, 503);
  }
  if (!secretMatches(expected, request.headers.get(REPORT_NOTIFY_HEADER))) {
    return json({ error: "unauthorized" }, 401);
  }
  const deps = await makeDeps();
  const failures: string[] = [];
  const run = async <T>(name: string, task: () => Promise<T>): Promise<T | null> => {
    try {
      return await task();
    } catch (e) {
      failures.push(name);
      console.error(`[maintenance] ${name} failed:`, e instanceof Error ? e.message : String(e));
      return null;
    }
  };
  const revocations = await run("apple-revocations", () => retryAppleRevocations(deps));
  const reports = await run("reports", () => sweepReports(deps));
  const erasures = await run("revenuecat-erasures", () => retryRevenueCatErasures(deps));
  // Counts only: this response is stored in the database's request log.
  return json(
    { ok: failures.length === 0, failures, revocations, reports, erasures },
    failures.length ? 500 : 200,
  );
}
