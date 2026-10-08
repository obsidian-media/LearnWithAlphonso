import { z } from "zod";
import { MIN_SHARED_SECRET_LENGTH, secretMatches } from "./shared-secret.server";

/**
 * Owner email for every content report. Called by the notify_content_report trigger
 * (supabase/migrations/20261008130300_content_reports_moderation_ops.sql) through pg_net, never by a client.
 * The provider is Resend (the project's sign-in mail provider, scripts/configure-custom-smtp.ts), not SES.
 */
export const REPORT_NOTIFY_HEADER = "x-report-notify-secret";

export const reportPayloadSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["user", "team_name", "ai_response"]),
  reason: z.string().min(1).max(500),
  context: z.record(z.string(), z.unknown()).nullable(),
  reporterName: z.string().nullable(),
  reportedId: z.string().uuid().nullable(),
  reportedName: z.string().nullable(),
  teamName: z.string().nullable(),
  createdAt: z.string(),
});
export type ReportPayload = z.infer<typeof reportPayloadSchema>;
export type EmailMessage = { to: string; subject: string; text: string };

const KIND_LABEL: Record<ReportPayload["kind"], string> = {
  user: "a learner",
  team_name: "a team name",
  ai_response: "an AI response",
};

/** Control characters out, length capped: the email is plain text built from user-supplied values. */
const clean = (v: string, max: number) => v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);

export function buildReportEmail(p: ReportPayload, to: string): EmailMessage {
  const lines = [
    `A new report about ${KIND_LABEL[p.kind]} was filed at ${p.createdAt}.`,
    "",
    `Report id: ${p.id}`,
    `Reason: ${clean(p.reason, 500)}`,
    `Reported by: ${clean(p.reporterName ?? "(unknown)", 80)}`,
    p.kind === "ai_response"
      ? "Reported account: none (AI response)"
      : `Reported account: ${clean(p.reportedName ?? "(deleted account)", 80)} (${p.reportedId ?? "no id"})`,
    ...(p.teamName ? [`Team: ${clean(p.teamName, 80)}`] : []),
    `Context: ${p.context ? clean(JSON.stringify(p.context), 2000) : "none"}`,
    "",
    "Respond within 24 hours: open the admin app's Reports page to reset the name, rename or disband the team, delete the account, or dismiss the report.",
  ];
  return { to, subject: `[Alphonso] New report: ${KIND_LABEL[p.kind]}`, text: lines.join("\n") };
}

export async function sendEmailViaResend(
  msg: EmailMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const key = process.env.RESEND_API_KEY ?? "";
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from:
        process.env.REPORT_NOTIFY_FROM || "Alphonso Reports <reports@hello.alphonsoecosystem.app>",
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function handleReportNotify(
  request: Request,
  send: (msg: EmailMessage) => Promise<void> = (m) => sendEmailViaResend(m),
): Promise<Response> {
  const expected = process.env.REPORT_NOTIFY_SECRET ?? "";
  const to = process.env.REPORT_NOTIFY_TO ?? "";
  if (expected.length < MIN_SHARED_SECRET_LENGTH || !to) {
    console.error(
      "[report-notify] REPORT_NOTIFY_SECRET (32+ chars) or REPORT_NOTIFY_TO is not configured",
    );
    return json({ error: "not-configured" }, 503);
  }
  // Authenticate before reading the body.
  if (!secretMatches(expected, request.headers.get(REPORT_NOTIFY_HEADER))) {
    return json({ error: "unauthorized" }, 401);
  }
  let payload: ReportPayload;
  try {
    payload = reportPayloadSchema.parse(await request.json());
  } catch {
    return json({ error: "bad-payload" }, 400);
  }
  try {
    await send(buildReportEmail(payload, to));
  } catch (e) {
    console.error("[report-notify] send failed:", e instanceof Error ? e.message : String(e));
    return json({ error: "send-failed" }, 502);
  }
  return json({ ok: true }, 200);
}
