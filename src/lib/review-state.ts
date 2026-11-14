/**
 * What the Review screen shows, as pure functions: which stage it is in, how far along the bar is and what the
 * empty and finished cards say. The view only lays these out. The iPhone's ReviewQueueView makes the same choices.
 */

export type ReviewStage = "loading" | "empty" | "question" | "done";

/** `cardCount` is null until the queue has loaded; `index` is the question being asked. */
export function reviewStage(cardCount: number | null, index: number): ReviewStage {
  if (cardCount === null) return "loading";
  if (cardCount === 0) return "empty";
  return index >= cardCount ? "done" : "question";
}

/** The bar: the question you are on counts once it has been checked, like the lesson's. 0 to 1. */
export function reviewProgress(index: number, cardCount: number, checked: boolean): number {
  if (cardCount <= 0) return 0;
  return Math.max(0, Math.min(1, (index + (checked ? 1 : 0)) / cardCount));
}

/** The pill beside the bar: "2/5 due". The number is a separate element so a screen reader can say it plainly. */
export function dueCount(index: number, cardCount: number): { position: number; of: number } {
  return { position: Math.min(index + 1, cardCount), of: cardCount };
}

/** The empty card: nothing is due. With items waiting it says how many; with none it says how items arrive. */
export function emptyBody(total: number): string {
  return total > 0
    ? `You have ${total} item${total === 1 ? "" : "s"} in review — none are due yet. Come back tomorrow.`
    : "Miss a question in a lesson and it lands here, returning at widening intervals until it sticks.";
}

/** The finished card's one line: right, to revisit, and (only when there are some) how many were retired. */
export function doneSummary(stats: { right: number; wrong: number; retired: number }): string {
  return `${stats.right} correct · ${stats.wrong} to revisit${
    stats.retired ? ` · ${stats.retired} mastered and retired` : ""
  }.`;
}
