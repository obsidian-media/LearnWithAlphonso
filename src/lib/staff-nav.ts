import type { Scope } from "./staff-scopes";

/**
 * The console's navigation. Items whose scope the signed-in person lacks are hidden. That is only courtesy: every
 * server function checks the scope itself (requireStaff), so a hidden link is never the control.
 */
export type NavGroupKey = "operate" | "content" | "system";
export type NavItem = {
  key: string;
  label: string;
  to: string;
  scope: Scope;
  alsoScope?: Scope;
  /** The rail group the item sits under. */
  group: NavGroupKey;
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "numbers",
    label: "Numbers",
    to: "/numbers",
    scope: "numbers.read",
    alsoScope: "numbers.revenue",
    group: "operate",
  },
  { key: "health", label: "System health", to: "/health", scope: "numbers.read", group: "system" },
  { key: "users", label: "Users", to: "/users", scope: "users.read", group: "operate" },
  { key: "support", label: "Support", to: "/support", scope: "support.read", group: "operate" },
  { key: "reports", label: "Reports", to: "/reports", scope: "reports.manage", group: "operate" },
  {
    key: "podcasts",
    label: "Podcasts",
    to: "/folders",
    scope: "podcasts.manage",
    group: "content",
  },
  { key: "staff", label: "Staff", to: "/staff", scope: "staff.manage", group: "system" },
  { key: "audit", label: "Action record", to: "/audit", scope: "audit.read", group: "system" },
];

/** The rail's groups in order, with the items inside each in the order the rail shows them. */
export const NAV_GROUPS: readonly { key: NavGroupKey; label: string; order: readonly string[] }[] =
  [
    { key: "operate", label: "Operate", order: ["support", "reports", "users", "numbers"] },
    { key: "content", label: "Content", order: ["podcasts"] },
    { key: "system", label: "System", order: ["staff", "audit", "health"] },
  ];

/** The rail for a person's scopes: only groups that still have an item, only items they may open. Home is separate. */
export function navGroupsFor(
  scopes: readonly string[],
): { key: NavGroupKey; label: string; items: NavItem[] }[] {
  const visible = navItemsFor(scopes);
  return NAV_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    items: g.order.flatMap((k) => visible.filter((i) => i.key === k && i.group === g.key)),
  })).filter((g) => g.items.length > 0);
}

export function navItemsFor(scopes: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      scopes.includes(item.scope) ||
      (item.alsoScope !== undefined && scopes.includes(item.alsoScope)),
  );
}

/** Where the console opens: Users when allowed, otherwise the first thing the person can use. */
export function homeFor(scopes: readonly string[]): string | null {
  const order = ["users", "reports", "podcasts", "support", "numbers", "health", "staff", "audit"];
  const visible = navItemsFor(scopes);
  for (const key of order) {
    const item = visible.find((i) => i.key === key);
    if (item) return item.to;
  }
  return null;
}
