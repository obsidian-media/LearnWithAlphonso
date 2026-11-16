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
  "numbers.revenue",
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

/**
 * What each scope is called on the Staff page. A Record over every Scope, so adding a scope without a label does not
 * compile (the Staff page once printed the raw `numbers.revenue`).
 */
export const SCOPE_LABELS: Record<Scope, string> = {
  "users.read": "See learners",
  "users.notes": "Write learner notes",
  "pro.grant": "Gift Pro",
  "pro.revoke": "Withdraw a gifted Pro",
  "user.block": "Block a learner",
  "user.ban": "Ban a learner",
  "user.unban": "Lift a ban",
  "user.delete": "Delete an account",
  "support.read": "Read Help chats",
  "support.reply": "Reply in Help chats",
  "support.assign": "Assign Help chats",
  "numbers.read": "See usage numbers",
  "numbers.revenue": "See revenue numbers",
  "audit.read": "Read the audit log",
  "staff.manage": "Manage staff",
  "podcasts.manage": "Manage podcasts",
  "reports.manage": "Handle reports",
};

/** The human label for a scope; an unknown string (a stored value from a newer or older build) is shown as it is. */
export function scopeLabel(scope: string): string {
  return isScope(scope) ? SCOPE_LABELS[scope] : scope;
}
