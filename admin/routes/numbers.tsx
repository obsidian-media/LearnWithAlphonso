import { createFileRoute, redirect } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffGetNumbers } from "@/lib/staff-numbers.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { NumbersScreen } from "@/components/console/numbers/NumbersScreen";
import type { NumbersApi } from "@/components/console/numbers/numbersApi";

/** The Numbers screen's one call: the server function checks the scopes and sends only the groups this person may see. */
const api: NumbersApi = {
  get: (window, refresh) => staffGetNumbers({ data: { window, refresh } }),
};

export const Route = createFileRoute("/numbers")({
  // No server-side render for this page: who is signed in lives in the browser (a server render has no session), so the
  // identity check in the loader runs there, never on the server. Otherwise every full load looked signed out.
  ssr: false,
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      const allowed = me.scopes.includes("numbers.read") || me.scopes.includes("numbers.revenue");
      if (!allowed) return { forbidden: true as const };
      return { forbidden: false as const, me: { scopes: me.scopes } };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      throw redirect({ to: "/signin" });
    }
  },
  component: Numbers,
});

function Numbers() {
  const data = Route.useLoaderData();
  if (data.forbidden) return <ForbiddenCard title="Numbers" scope="numbers.read" />;
  return <NumbersScreen me={data.me} api={api} />;
}
