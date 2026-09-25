import { createFileRoute, redirect } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";

export const Route = createFileRoute("/")({
  // The gate is the server function, not this loader. A loader runs on
  // the client too and is trivially skipped; adminWhoAmI throws for
  // anyone not on the allowlist, and every other admin call is gated
  // independently by the same middleware. This redirect is a courtesy
  // to a signed-out admin, not a control.
  loader: async () => {
    try {
      return await adminWhoAmI();
    } catch {
      throw redirect({ to: "/signin" });
    }
  },
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-2xl font-semibold">Alphonso Admin</h1>
      <nav className="mt-6 flex flex-col gap-2">
        {/* A plain anchor rather than <Link>: /folders arrives in Task 4,
            and Link is typed against the generated route tree, so linking
            to a route that does not exist yet would not compile. Converted
            to <Link> once the route exists -- never by disabling route
            typing, which is what catches a link to a renamed route. */}
        <a href="/folders" className="text-moss underline">
          Folders
        </a>
      </nav>
    </main>
  );
}
