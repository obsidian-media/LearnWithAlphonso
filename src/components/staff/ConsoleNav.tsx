import { navItemsFor } from "../../lib/staff-nav";

/**
 * The console's navigation. Items whose scope the signed-in person lacks are not shown (courtesy only: every server
 * function checks the scope). Plain links: the console is a handful of pages, and a full load keeps each page's
 * server-side check in front of it.
 */
export function ConsoleNav({
  scopes,
  role,
  current,
}: {
  scopes: readonly string[];
  role: string;
  current?: string;
}) {
  const items = navItemsFor(scopes);
  return (
    <header className="border-b border-ds-line bg-ds-card">
      <nav
        aria-label="Console"
        className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-1 gap-y-1 px-4 py-2"
      >
        <span className="font-display mr-3 text-base font-bold text-ds-ink">Alphonso console</span>
        {items.map((item) => (
          <a
            key={item.key}
            href={item.to}
            aria-current={current === item.key ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              current === item.key
                ? "bg-ds-ink text-ds-card"
                : "text-ds-ink-soft hover:bg-ds-sunk hover:text-ds-ink"
            }`}
          >
            {item.label}
          </a>
        ))}
        <span className="ml-auto text-xs text-ds-ink-soft">{role}</span>
      </nav>
    </header>
  );
}
