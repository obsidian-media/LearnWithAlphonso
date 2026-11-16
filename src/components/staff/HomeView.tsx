import { homeCardsFor } from "../../lib/staff-home-cards";
import { ConsoleCard } from "./ConsoleCard";

export type HomeCounts = {
  support?: { open: number; unassigned: number } | null;
  reports?: { open: number } | null;
  numbers?: { newLearnersToday: number } | null;
};

function Big({ children }: { children: React.ReactNode }) {
  return <p className="font-display text-3xl font-extrabold text-ds-ink">{children}</p>;
}

function Open({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-sm font-bold text-ds-choice underline">
      {children}
    </a>
  );
}

/**
 * The console home: one card per page the person may use, for what needs them today. Counts only, no names. A card
 * whose count could not be read says so instead of showing 0. Someone with no cards gets the "no pages yet" card.
 */
export function HomeView({ scopes, counts }: { scopes: readonly string[]; counts: HomeCounts }) {
  const cards = homeCardsFor(scopes);
  if (cards.length === 0) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <ConsoleCard className="mt-2 max-w-xl">
          <h1 className="font-display text-lg font-extrabold text-ds-ink">Alphonso console</h1>
          <p className="ds-type-footnote text-ds-ink-soft">
            Your account has no console pages yet. Ask the owner.
          </p>
        </ConsoleCard>
      </main>
    );
  }
  const unread = <p className="text-sm text-ds-ink-soft">Could not read this count.</p>;
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-semibold text-ds-ink">Alphonso console</h1>
      <p className="ds-type-footnote mt-1 text-ds-ink-soft">What needs you today.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.includes("support") ? (
          <ConsoleCard title="Support">
            {counts.support ? (
              <>
                <Big>{counts.support.open}</Big>
                <p className="ds-type-footnote text-ds-ink-soft">
                  open tickets, {counts.support.unassigned} unassigned
                </p>
              </>
            ) : (
              unread
            )}
            <Open href="/support">Open the inbox</Open>
          </ConsoleCard>
        ) : null}
        {cards.includes("reports") ? (
          <ConsoleCard title="Reports">
            {counts.reports ? (
              <>
                <Big>{counts.reports.open}</Big>
                <p className="ds-type-footnote text-ds-ink-soft">open reports</p>
              </>
            ) : (
              unread
            )}
            <Open href="/reports">Open reports</Open>
          </ConsoleCard>
        ) : null}
        {cards.includes("numbers") ? (
          <ConsoleCard title="Numbers">
            {counts.numbers ? (
              <>
                <Big>{counts.numbers.newLearnersToday}</Big>
                <p className="ds-type-footnote text-ds-ink-soft">new learners today</p>
              </>
            ) : (
              unread
            )}
            <Open href="/numbers">Open numbers</Open>
          </ConsoleCard>
        ) : null}
      </div>
    </main>
  );
}
