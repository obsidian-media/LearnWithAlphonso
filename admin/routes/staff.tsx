import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffAddStaff, staffListStaff, staffUpdateStaff } from "@/lib/staff-admin.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { StaffView } from "@/components/staff/StaffView";

export const Route = createFileRoute("/staff")({
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("staff.manage")) return { forbidden: true as const };
      return { forbidden: false as const, rows: await staffListStaff(), myId: me.userId };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      throw redirect({ to: "/signin" });
    }
  },
  component: Staff,
});

function Staff() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data.forbidden) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-ink-soft">You do not have access to this page.</p>
      </main>
    );
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <StaffView
        rows={data.rows}
        myId={data.myId}
        error={error}
        busy={busy}
        onAdd={(input) => run(() => staffAddStaff({ data: input }))}
        onUpdate={(input) => run(() => staffUpdateStaff({ data: input }))}
      />
    </main>
  );
}
