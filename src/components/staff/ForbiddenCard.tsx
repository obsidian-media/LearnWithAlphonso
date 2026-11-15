import { forbiddenLine } from "../../lib/staff-forbidden";
import type { Scope } from "../../lib/staff-scopes";
import { ConsoleCard } from "./ConsoleCard";

/** A signed-in person who lacks a page's scope: the page title, which scope is missing, and who to ask. */
export function ForbiddenCard({ title, scope }: { title: string; scope: Scope }) {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-semibold text-ds-ink">{title}</h1>
      <ConsoleCard className="mt-4 max-w-xl">
        <p className="text-sm font-bold text-ds-ink">Forbidden: missing scope {scope}</p>
        <p className="ds-type-footnote text-ds-ink-soft">{forbiddenLine(scope)}</p>
      </ConsoleCard>
    </main>
  );
}
