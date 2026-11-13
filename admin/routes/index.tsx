import { createFileRoute, redirect } from "@tanstack/react-router";
import { SECOND_FACTOR_REQUIRED_MESSAGE } from "@/lib/admin-auth";
import { adminWhoAmI } from "@/lib/admin.functions";
import { homeFor } from "@/lib/staff-nav";

export const Route = createFileRoute("/")({
  // The gate is the server function, not this loader. A loader runs on
  // the client too and is trivially skipped; adminWhoAmI throws for
  // anyone who is not active staff, and every other console call is gated
  // independently by requireStaff. This redirect is a courtesy to a
  // signed-out person, not a control.
  loader: async () => {
    let scopes: readonly string[];
    try {
      scopes = (await adminWhoAmI()).scopes;
    } catch (error) {
      // Staff whose session lacks a required second factor are sent to finish it, not to sign in again.
      const needsSecondFactor =
        error instanceof Error && error.message.includes(SECOND_FACTOR_REQUIRED_MESSAGE);
      throw redirect({ to: "/signin", search: needsSecondFactor ? { mfa: "required" } : {} });
    }
    // The console opens on Users, or on the first thing this person is allowed to use.
    const home = homeFor(scopes);
    if (home) throw redirect({ href: home });
    return null;
  },
  component: NothingToOpen,
});

function NothingToOpen() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-2xl font-semibold">Alphonso console</h1>
      <p className="mt-3 text-ink-soft">Your account has no console pages yet. Ask the owner.</p>
    </main>
  );
}
