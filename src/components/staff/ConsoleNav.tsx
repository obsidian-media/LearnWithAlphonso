import { navItemsFor } from "../../lib/staff-nav";

/**
 * The console's navigation. Items whose scope the signed-in person lacks are not shown (courtesy only: every server
 * function checks the scope). Plain links: the console is a handful of pages, and a full load keeps each page's
 * server-side check in front of it. The right end names the person and offers Sign out.
 */
export function ConsoleNav({
  scopes,
  role,
  name,
  current,
  onSignOut,
}: {
  scopes: readonly string[];
  role: string;
  /** The signed-in person's display name, when they have one. */
  name?: string | null;
  current?: string;
  onSignOut?: () => void;
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
        <span className="ml-auto flex items-center gap-2 text-xs font-semibold text-ds-ink-soft max-sm:w-full max-sm:justify-end">
          <span>{name ? `${name} · ${role}` : role}</span>
          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="font-bold text-ds-choice underline"
            >
              Sign out
            </button>
          ) : null}
        </span>
      </nav>
    </header>
  );
}
