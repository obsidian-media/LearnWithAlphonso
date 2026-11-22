import type { AdminReport } from "./admin.functions";

/** What a staff member can do with one open report. Courtesy only: every action's server function checks its own scope. */
export type ReportAction =
  "dismiss" | "reset_name" | "ban" | "delete" | "rename_team" | "disband_team";

/**
 * The action set per kind of report (spec A.6, R10 to R16):
 *   user         reset display name, ban author, delete account (which also dismisses the report), dismiss
 *   team_name    rename team, disband team (typed DISBAND), dismiss
 *   ai_response  dismiss only (there is no account to act on)
 * Anything acting on the reported ACCOUNT needs that account to still exist. Ban and delete keep their own scopes
 * (user.ban, user.delete); everything else is reports.manage, which the screen already requires.
 */
export function reportActions(
  report: Pick<AdminReport, "kind" | "reportedId" | "teamId">,
  scopes: readonly string[],
): ReportAction[] {
  const has = (s: string) => scopes.includes(s);
  const out: ReportAction[] = ["dismiss"];
  if (report.kind === "user" && report.reportedId) {
    out.push("reset_name");
    if (has("user.ban")) out.push("ban");
    if (has("user.delete")) out.push("delete");
  }
  if (report.kind === "team_name" && report.teamId) {
    out.push("rename_team", "disband_team");
  }
  return out;
}
