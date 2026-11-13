import type { Scope } from "./staff-scopes";

/**
 * The console's navigation. Items whose scope the signed-in person lacks are hidden. That is only courtesy: every
 * server function checks the scope itself (requireStaff), so a hidden link is never the control.
 */
export type NavItem = { key: string; label: string; to: string; scope: Scope; soon?: string };

export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "numbers",
    label: "Numbers",
    to: "/numbers",
    scope: "numbers.read",
    soon: "coming in phase 3",
  },
  { key: "users", label: "Users", to: "/users", scope: "users.read" },
  { key: "support", label: "Support", to: "/support", scope: "support.read", soon: "phase 2" },
  { key: "reports", label: "Reports", to: "/reports", scope: "reports.manage" },
  { key: "podcasts", label: "Podcasts", to: "/folders", scope: "podcasts.manage" },
  { key: "staff", label: "Staff", to: "/staff", scope: "staff.manage" },
  { key: "audit", label: "Action record", to: "/audit", scope: "audit.read" },
];

export function navItemsFor(scopes: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter((item) => scopes.includes(item.scope));
}

/** Where the console opens: Users when allowed, otherwise the first thing the person can use. */
export function homeFor(scopes: readonly string[]): string | null {
  const order = ["users", "reports", "podcasts", "support", "numbers", "staff", "audit"];
  const visible = navItemsFor(scopes);
  for (const key of order) {
    const item = visible.find((i) => i.key === key);
    if (item) return item.to;
  }
  return null;
}
