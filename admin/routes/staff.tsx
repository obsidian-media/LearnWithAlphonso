import { createFileRoute, redirect } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffAddStaff, staffListStaff, staffUpdateStaff } from "@/lib/staff-admin.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { StaffScreen } from "@/components/console/staff/StaffScreen";
import type { StaffApi } from "@/components/console/staff/staffApi";

/** The Staff screen's calls: the existing server functions, each owner-only on the server and each asking for its reason. */
const api: StaffApi = {
  list: () => staffListStaff(),
  add: (input) => staffAddStaff({ data: input }),
  update: (input) => staffUpdateStaff({ data: input }),
};

export const Route = createFileRoute("/staff")({
  // No server-side render for this page: who is signed in lives in the browser (a server render has no session), so the
  // identity check in the loader runs there, never on the server. Otherwise every full load looked signed out.
  ssr: false,
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      // Owner only: a support person who somehow stores the scope is still refused by the server.
      if (!me.scopes.includes("staff.manage") || me.role !== "owner")
        return { forbidden: true as const };
      return { forbidden: false as const, myId: me.userId };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      throw redirect({ to: "/signin" });
    }
  },
  component: Staff,
});

function Staff() {
  const data = Route.useLoaderData();
  if (data.forbidden) return <ForbiddenCard title="Staff" scope="staff.manage" />;
  return <StaffScreen myId={data.myId} api={api} />;
}
