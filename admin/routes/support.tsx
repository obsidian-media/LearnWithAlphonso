import { createFileRoute, redirect } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";

export const Route = createFileRoute("/support")({
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      return { allowed: me.scopes.includes("support.read") };
    } catch {
      throw redirect({ to: "/signin" });
    }
  },
  component: Support,
});

function Support() {
  const { allowed } = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="font-display text-2xl font-semibold">Support</h1>
      <p className="mt-3 text-ink-soft">
        {allowed
          ? "The support inbox is coming in phase 2."
          : "You do not have access to this page."}
      </p>
    </main>
  );
}
