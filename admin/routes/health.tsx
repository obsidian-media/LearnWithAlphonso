import { createFileRoute, redirect } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffGetHealth } from "@/lib/staff-health.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { HealthScreen } from "@/components/console/health/HealthScreen";
import type { HealthApi } from "@/components/console/health/healthApi";

/** The Health screen's one call: the server function runs the live checks and checks numbers.read itself. */
const api: HealthApi = { get: () => staffGetHealth() };

export const Route = createFileRoute("/health")({
  // No server-side render for this page: who is signed in lives in the browser (a server render has no session), so the
  // identity check in the loader runs there, never on the server. Otherwise every full load looked signed out.
  ssr: false,
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      return { allowed: me.scopes.includes("numbers.read") };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { allowed: false };
      throw redirect({ to: "/signin" });
    }
  },
  component: Health,
});

function Health() {
  const { allowed } = Route.useLoaderData();
  if (!allowed) return <ForbiddenCard title="Health" scope="numbers.read" />;
  return <HealthScreen api={api} />;
}
