import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffGetSystemHealth, type OpsHealth } from "@/lib/staff-health.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { SystemHealthView } from "@/components/staff/SystemHealthView";

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
  const [data, setData] = useState<OpsHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    staffGetSystemHealth()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not read system health."));
  }, [allowed]);

  if (!allowed) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <h1 className="font-display text-2xl font-semibold text-ds-ink">System health</h1>
        <div className="mt-4 rounded-2xl border border-ds-line bg-ds-card p-4">
          <p className="text-sm font-bold text-ds-ink">Forbidden: missing scope numbers.read</p>
        </div>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <SystemHealthView data={data} error={error} />
    </main>
  );
}
