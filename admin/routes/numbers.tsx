import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffGetNumbers, type NumbersResponse } from "@/lib/staff-numbers.functions";
import { DEFAULT_WINDOW, type WindowDays } from "@/lib/numbers-core";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { NumbersView } from "@/components/staff/NumbersView";

export const Route = createFileRoute("/numbers")({
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      const allowed = me.scopes.includes("numbers.read") || me.scopes.includes("numbers.revenue");
      return { allowed };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { allowed: false };
      throw redirect({ to: "/signin" });
    }
  },
  component: Numbers,
});

function Numbers() {
  const { allowed } = Route.useLoaderData();
  const [windowDays, setWindowDays] = useState<WindowDays>(DEFAULT_WINDOW);
  const [data, setData] = useState<NumbersResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  async function load(w: WindowDays, refresh: boolean) {
    const mine = ++latest.current;
    setBusy(true);
    setError(null);
    try {
      const result = await staffGetNumbers({ data: { window: w, refresh } });
      if (mine === latest.current) setData(result);
    } catch (e) {
      if (mine === latest.current)
        setError(e instanceof Error ? e.message : "Could not read the numbers.");
    } finally {
      if (mine === latest.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (allowed) void load(DEFAULT_WINDOW, false);
  }, [allowed]);

  if (!allowed) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <h1 className="font-display text-2xl font-semibold text-ds-ink">Numbers</h1>
        <div className="mt-4 rounded-2xl border border-ds-line bg-ds-card p-4">
          <p className="text-sm font-bold text-ds-ink">Forbidden: missing scope numbers.read</p>
          <p className="ds-type-footnote text-ds-ink-soft">
            Ask the owner to add the Numbers permission to your account.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <NumbersView
        data={data}
        windowDays={windowDays}
        busy={busy}
        error={error}
        onWindow={(w) => {
          setWindowDays(w);
          setData(null);
          void load(w, false);
        }}
        onRefresh={() => void load(windowDays, true)}
      />
    </main>
  );
}
