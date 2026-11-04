/**
 * The button under the words-to-learn deck: "Next word" until the last card, then "Start practice".
 * Mirrors the iOS Kit's VocabDeck.swift.
 */
export function deckButtonTitle(index: number, count: number): string {
  return index < count - 1 ? "Next word" : "Start practice";
}
