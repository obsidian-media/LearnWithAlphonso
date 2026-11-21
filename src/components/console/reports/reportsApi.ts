import type { AdminReport } from "../../../lib/admin.functions";

export type ReportRow = AdminReport;

/**
 * Everything the Reports screen calls, as one object the route fills with the real server functions. Every call is
 * gated on the server (reports.manage; ban and delete keep user.ban and user.delete) and every change carries the
 * reason the person typed, which the server and the database each refuse to do without.
 */
export type ReportsApi = {
  list: () => Promise<ReportRow[]>;
  dismiss: (reportId: string, reason: string) => Promise<unknown>;
  resetName: (reportId: string, reason: string) => Promise<unknown>;
  renameTeam: (reportId: string, name: string, reason: string) => Promise<unknown>;
  disbandTeam: (reportId: string, reason: string) => Promise<unknown>;
  ban: (userId: string, reason: string, confirmEmail: string) => Promise<unknown>;
  /** Deletes the account; the screen then dismisses the report with the same reason. */
  deleteUser: (
    userId: string,
    reason: string,
    confirmEmail: string,
  ) => Promise<{ failedSteps: string[] } | unknown>;
};
