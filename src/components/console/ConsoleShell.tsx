import { useEffect, useState, type ReactNode } from "react";
import type { NavCounts } from "../../lib/staff-home.functions";
import { navGroupsFor, type NavItem } from "../../lib/staff-nav";
import {
  RAIL_KEY,
  THEME_KEY,
  applyConsoleTheme,
  readStored,
  writeStored,
  type ConsoleTheme,
} from "../../lib/console-theme";
import { Figure } from "./Figure";

export type ShellMe = { displayName: string | null; role: string; scopes: readonly string[] };

/** The pip for an item: only a real count above zero. A missing or unreadable count shows nothing, never a 0. */
export function pipFor(key: string, counts: NavCounts | null | undefined): number | null {
  const n = key === "support" ? counts?.support : key === "reports" ? counts?.reports : null;
  return typeof n === "number" && n > 0 ? n : null;
}

function Icon({ name }: { name: string }) {
  const common = {
    className: "h-[18px] w-[18px] flex-none",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "sun":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
    case "collapse":
      return (
        <svg {...common}>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </svg>
      );
  }
}

function NavLink({
  item,
  current,
  count,
  collapsed,
}: {
  item: Pick<NavItem, "key" | "label" | "to">;
  current: boolean;
  count: number | null;
  collapsed: boolean;
}) {
  return (
    <a
      href={item.to}
      aria-current={current ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={`relative flex min-h-11 items-center gap-3 rounded-xl px-2.5 text-sm font-semibold ${
        current ? "bg-ds-sunk text-ds-ink" : "text-ds-ink-soft hover:bg-ds-sunk hover:text-ds-ink"
      } ${collapsed ? "justify-center" : ""}`}
    >
      <Icon name={item.key} />
      <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
      {count !== null ? (
        <span
          data-pip=""
          className={`rounded-full bg-ds-flame px-1.5 text-xs font-extrabold leading-[18px] text-ds-on-hero ${
            collapsed ? "absolute right-1 top-1" : "ml-auto"
          }`}
        >
          <Figure value={count} reason="" />
          <span className="sr-only"> waiting</span>
        </span>
      ) : null}
    </a>
  );
}

function RailBody({
  me,
  counts,
  current,
  collapsed,
  onToggleCollapse,
  onSignOut,
  theme,
  onToggleTheme,
  mobile,
}: {
  me: ShellMe;
  counts: NavCounts | null | undefined;
  current: string | undefined;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSignOut: () => void;
  theme: ConsoleTheme;
  onToggleTheme: () => void;
  mobile: boolean;
}) {
  const groups = navGroupsFor(me.scopes);
  const initial = (me.displayName ?? me.role).trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <div
        className={`flex items-center gap-2.5 px-1.5 pb-3 pt-1 ${collapsed ? "justify-center" : ""}`}
      >
        <img
          src="/icon-512.png"
          alt=""
          width={34}
          height={34}
          className="h-[34px] w-[34px] rounded-[10px]"
        />
        <span className={collapsed ? "sr-only" : "leading-tight"}>
          <b className="block font-display text-base font-extrabold text-ds-ink">Alphonso</b>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-ds-ink-faint">
            Console
          </span>
        </span>
      </div>
      <nav aria-label="Console" className="flex flex-col gap-0.5 overflow-y-auto">
        <NavLink
          item={{ key: "home", label: "Home", to: "/" }}
          current={current === "home"}
          count={null}
          collapsed={collapsed}
        />
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-0.5">
            <p
              className={`px-2.5 pb-1 pt-3 text-xs font-extrabold uppercase tracking-[0.14em] text-ds-ink-faint ${collapsed ? "sr-only" : ""}`}
            >
              {g.label}
            </p>
            {g.items.map((item) => (
              <NavLink
                key={item.key}
                item={item}
                current={current === item.key}
                count={pipFor(item.key, counts)}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 border-t border-ds-line pt-3">
        <div
          className={`flex items-center gap-2.5 px-1.5 text-sm ${collapsed ? "justify-center" : ""}`}
        >
          <span
            aria-hidden="true"
            className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-ds-brand font-display text-sm font-bold text-ds-on-hero"
          >
            {initial}
          </span>
          <span className={collapsed ? "sr-only" : "min-w-0 leading-tight"}>
            <b className="block truncate font-bold text-ds-ink">{me.displayName ?? "Staff"}</b>
            <span className="text-xs font-semibold text-ds-ink-faint">{me.role}</span>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className={`min-h-11 px-2 text-xs font-bold text-ds-choice ${collapsed ? "sr-only" : "ml-auto"}`}
          >
            Sign out
          </button>
        </div>
        <div className={`flex gap-2 ${collapsed ? "flex-col" : ""}`}>
          {mobile ? null : (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-pressed={collapsed}
              aria-label={collapsed ? "Expand the menu" : "Collapse the menu"}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-ds-line bg-ds-card text-xs font-semibold text-ds-ink-soft"
            >
              <span className={collapsed ? "rotate-180" : ""}>
                <Icon name="collapse" />
              </span>
              <span className={collapsed ? "sr-only" : ""}>Collapse</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "night" ? "Switch to day mode" : "Switch to night mode"}
            className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-ds-line bg-ds-card text-ds-ink-soft"
          >
            <Icon name={theme === "night" ? "moon" : "sun"} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The console frame: a collapsible left rail on a desktop (brand, Home, the role's groups with real pips, who you are,
 * Sign out, the day/night button) and, on a phone, a top bar with a menu button that opens the same rail as a drawer.
 * The links are plain links (a full load puts each page's own server check in front of it). Every item is courtesy:
 * the server decides what a person may open. The rail's collapsed state and the theme live in localStorage.
 */
export function ConsoleShell({
  me,
  counts,
  current,
  onSignOut,
  children,
}: {
  me: ShellMe;
  counts?: NavCounts | null;
  current?: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<ConsoleTheme>("day");
  const [open, setOpen] = useState(false);

  // After mount: the page already carries the theme (the boot script ran before first paint); read it back so the
  // button matches, and read the rail's remembered width.
  useEffect(() => {
    setTheme(document.documentElement.dataset.consoleTheme === "night" ? "night" : "day");
    setCollapsed(readStored(RAIL_KEY) === "1");
  }, []);

  // A client-side navigation does not reload the page, so the phone menu closes when the page changes.
  useEffect(() => {
    setOpen(false);
  }, [current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggleTheme() {
    const next: ConsoleTheme = theme === "night" ? "day" : "night";
    applyConsoleTheme(document.documentElement, next);
    writeStored(THEME_KEY, next);
    setTheme(next);
  }
  function toggleCollapse() {
    const next = !collapsed;
    writeStored(RAIL_KEY, next ? "1" : "0");
    setCollapsed(next);
  }

  const body = (mobile: boolean) => (
    <RailBody
      me={me}
      counts={counts}
      current={current}
      collapsed={mobile ? false : collapsed}
      onToggleCollapse={toggleCollapse}
      onSignOut={onSignOut}
      theme={theme}
      onToggleTheme={toggleTheme}
      mobile={mobile}
    />
  );

  return (
    <div className="min-h-dvh md:flex md:items-start">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ds-line bg-ds-card px-3 py-2 md:hidden">
        <button
          type="button"
          aria-label="Open the menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-ds-line"
        >
          <Icon name="menu" />
        </button>
        <img src="/icon-512.png" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
        <b className="font-display text-base font-extrabold text-ds-ink">Alphonso console</b>
      </header>

      <aside
        data-rail=""
        className={`sticky top-0 z-20 hidden h-dvh flex-none border-r border-ds-line bg-ds-card md:block ${
          collapsed ? "w-[72px]" : "w-60"
        }`}
      >
        {body(false)}
      </aside>

      {open ? (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            type="button"
            aria-label="Close the menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ds-ink/40"
          />
          <div
            data-drawer=""
            className="absolute inset-y-0 left-0 w-[min(18rem,85vw)] bg-ds-card shadow-xl"
          >
            {body(true)}
          </div>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
