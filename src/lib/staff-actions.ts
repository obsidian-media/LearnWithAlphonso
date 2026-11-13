import type { LearnerFacts } from "./staff-user-facts.server";

/**
 * Which buttons the learner page offers for the viewer's scopes. Courtesy only (see staff-nav.ts): each action's
 * server function checks its own scope.
 */
export type UserAction = "gift" | "revoke_gift" | "block" | "unblock" | "ban" | "unban" | "delete";

type FactsForActions = Pick<LearnerFacts, "pro" | "restrictions">;

const activeRestriction = (facts: FactsForActions, kind: string) =>
  facts.restrictions.some((r) => r.kind === kind && r.liftedAt === null);

export function allowedActions(scopes: readonly string[], facts: FactsForActions): UserAction[] {
  const has = (s: string) => scopes.includes(s);
  const blocked = activeRestriction(facts, "block");
  const banned = activeRestriction(facts, "ban");
  const out: UserAction[] = [];
  if (has("pro.grant")) out.push("gift");
  if (has("pro.revoke") && facts.pro.source === "gift") out.push("revoke_gift");
  if (has("user.block")) out.push(blocked ? "unblock" : "block");
  if (banned ? has("user.unban") : has("user.ban")) out.push(banned ? "unban" : "ban");
  if (has("user.delete")) out.push("delete");
  return out;
}

export const ACTION_LABEL: Record<UserAction, string> = {
  gift: "Give Pro",
  revoke_gift: "End gifted Pro",
  block: "Block",
  unblock: "Lift block",
  ban: "Ban",
  unban: "Lift ban",
  delete: "Delete account",
};

/** Ban and delete need the learner's email typed back. */
export const NEEDS_EMAIL: readonly UserAction[] = ["ban", "delete"];
