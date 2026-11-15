import type { Scope } from "./staff-scopes";

/** The cards on the console home page and the scope each needs. A card is shown only to someone who holds its scope. */
export type HomeCardKey = "support" | "reports" | "numbers";

export const HOME_CARDS: readonly { key: HomeCardKey; scope: Scope }[] = [
  { key: "support", scope: "support.read" },
  { key: "reports", scope: "reports.manage" },
  { key: "numbers", scope: "numbers.read" },
];

export function homeCardsFor(scopes: readonly string[]): HomeCardKey[] {
  return HOME_CARDS.filter((c) => scopes.includes(c.scope)).map((c) => c.key);
}
