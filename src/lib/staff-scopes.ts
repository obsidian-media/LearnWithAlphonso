/**
 * Staff roles and the scopes (named actions) a role may use. Pure data and decisions: no I/O, so the same rules are
 * unit-tested and shared by the server middleware and the console UI (which only HIDES what a role cannot do; the
 * server decides).
 */
export type StaffRole = "owner" | "support" | "support_ai";

export const STAFF_ROLES: readonly StaffRole[] = ["owner", "support", "support_ai"];

export const SCOPES = [
  "users.read",
  "users.notes",
  "pro.grant",
  "pro.revoke",
  "user.block",
  "user.ban",
  "user.unban",
  "user.delete",
  "support.read",
  "support.reply",
  "support.assign",
  "numbers.read",
  "audit.read",
  "staff.manage",
  "podcasts.manage",
  "reports.manage",
] as const;

export type Scope = (typeof SCOPES)[number];

export const DEFAULT_SCOPES: Record<StaffRole, Scope[]> = {
  owner: [...SCOPES],
  support: [
    "users.read",
    "users.notes",
    "support.read",
    "support.reply",
    "support.assign",
    "user.block",
    "reports.manage",
  ],
  support_ai: [],
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

export function isScope(value: unknown): value is Scope {
  return typeof value === "string" && (SCOPES as readonly string[]).includes(value);
}

/**
 * The scopes a person really has. The owner has all of them whatever is stored. support_ai is an actor label for AI
 * turns, not a login, so it never has an admin scope even if a row says otherwise. Unknown strings are dropped.
 */
export function effectiveScopes(role: StaffRole, stored: readonly string[]): Scope[] {
  if (role === "owner") return [...SCOPES];
  if (role === "support_ai") return [];
  return SCOPES.filter((s) => stored.includes(s));
}

export function hasScope(role: StaffRole, stored: readonly string[], needed: Scope): boolean {
  return effectiveScopes(role, stored).includes(needed);
}
