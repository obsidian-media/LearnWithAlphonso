import { createFileRoute, redirect } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffListAudit, staffListAuditActors } from "@/lib/staff-audit.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { AuditScreen } from "@/components/console/audit/AuditScreen";
import type { AuditApi } from "@/components/console/audit/auditApi";

/** The Audit screen's calls: both server functions check audit.read themselves and only read. */
const api: AuditApi = {
  list: (filters, cursor) => staffListAudit({ data: { ...filters, cursor } }),
  actors: () => staffListAuditActors(),
};

export const Route = createFileRoute("/audit")({
  // No server-side render for this page: who is signed in lives in the browser (a server render has no session), so the
  // identity check in the loader runs there, never on the server. Otherwise every full load looked signed out.
  ssr: false,
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("audit.read")) return { forbidden: true as const };
      return { forbidden: false as const };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      throw redirect({ to: "/signin" });
    }
  },
  component: Audit,
});

function Audit() {
  const data = Route.useLoaderData();
  if (data.forbidden) return <ForbiddenCard title="Action record" scope="audit.read" />;
  return <AuditScreen api={api} />;
}
