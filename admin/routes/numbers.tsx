import { createFileRoute, redirect } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";

export const Route = createFileRoute("/numbers")({
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      return { allowed: me.scopes.includes("numbers.read") };
    } catch {
      throw redirect({ to: "/signin" });
    }
  },
  component: Numbers,
});

function Numbers() {
  const { allowed } = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="font-display text-2xl font-semibold">Numbers</h1>
      <p className="mt-3 text-ink-soft">
        {allowed
          ? "The numbers dashboard is coming in phase 3."
          : "You do not have access to this page."}
      </p>
    </main>
  );
}
