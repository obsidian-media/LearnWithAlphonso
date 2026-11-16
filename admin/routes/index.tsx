import { createFileRoute, redirect } from "@tanstack/react-router";
import { SECOND_FACTOR_REQUIRED_MESSAGE } from "@/lib/admin-auth";
import { adminWhoAmI } from "@/lib/admin.functions";
import { homeCardsFor } from "@/lib/staff-home-cards";
import { staffHomeNumbers, staffHomeReports, staffHomeSupport } from "@/lib/staff-home.functions";
import { HomeView, type HomeCounts } from "@/components/staff/HomeView";

export const Route = createFileRoute("/")({
  // The gate is the server function, not this loader. A loader runs on
  // the client too and is trivially skipped; adminWhoAmI throws for
  // anyone who is not active staff, and every card's count is read by a
  // call that checks its own scope. This redirect is a courtesy to a
  // signed-out person, not a control.
  loader: async (): Promise<{ scopes: readonly string[]; counts: HomeCounts }> => {
    let scopes: readonly string[];
    try {
      scopes = (await adminWhoAmI()).scopes;
    } catch (error) {
      // Staff whose session lacks a required second factor are sent to finish it, not to sign in again.
      const needsSecondFactor =
        error instanceof Error && error.message.includes(SECOND_FACTOR_REQUIRED_MESSAGE);
      throw redirect({ to: "/signin", search: needsSecondFactor ? { mfa: "required" } : {} });
    }
    // One small call per card the person may see; a failed count shows as unreadable, never as 0.
    const cards = homeCardsFor(scopes);
    const [support, reports, numbers] = await Promise.all([
      cards.includes("support") ? staffHomeSupport().catch(() => null) : null,
      cards.includes("reports") ? staffHomeReports().catch(() => null) : null,
      cards.includes("numbers") ? staffHomeNumbers().catch(() => null) : null,
    ]);
    return { scopes, counts: { support, reports, numbers } };
  },
  component: Home,
});

function Home() {
  const { scopes, counts } = Route.useLoaderData();
  return <HomeView scopes={scopes} counts={counts} />;
}
