import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  adminDisbandTeam,
  adminDismissReport,
  adminListReports,
  adminRenameTeam,
  adminResetDisplayName,
  adminWhoAmI,
} from "@/lib/admin.functions";
import { staffBanUser, staffDeleteUser } from "@/lib/staff-users.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { ReportsScreen } from "@/components/console/reports/ReportsScreen";
import type { ReportsApi } from "@/components/console/reports/reportsApi";

/** The Reports screen's calls: the existing server functions, each checking its own scope and asking for its reason. */
const api: ReportsApi = {
  list: () => adminListReports(),
  dismiss: (reportId, reason) => adminDismissReport({ data: { reportId, reason } }),
  resetName: (reportId, reason) => adminResetDisplayName({ data: { reportId, reason } }),
  renameTeam: (reportId, name, reason) => adminRenameTeam({ data: { reportId, name, reason } }),
  disbandTeam: (reportId, reason) => adminDisbandTeam({ data: { reportId, reason } }),
  ban: (id, reason, confirmEmail) => staffBanUser({ data: { id, reason, confirmEmail } }),
  deleteUser: (id, reason, confirmEmail) => staffDeleteUser({ data: { id, reason, confirmEmail } }),
};

export const Route = createFileRoute("/reports")({
  // No server-side render for this page: who is signed in lives in the browser (a server render has no session), so the
  // identity check in the loader runs there, never on the server. Otherwise every full load looked signed out.
  ssr: false,
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("reports.manage")) return { forbidden: true as const };
      return { forbidden: false as const, scopes: me.scopes };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      throw redirect({ to: "/signin" });
    }
  },
  component: Reports,
});

function Reports() {
  const data = Route.useLoaderData();
  if (data.forbidden) return <ForbiddenCard title="Reports" scope="reports.manage" />;
  return <ReportsScreen api={api} scopes={data.scopes} />;
}
