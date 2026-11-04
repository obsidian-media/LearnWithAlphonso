import Foundation

/// The button under the words-to-learn deck: "Next word" until the last card, then "Start practice".
/// Mirrors the web's `src/lib/vocab-deck.ts`.
public enum VocabDeck {
    public static func buttonTitle(index: Int, count: Int) -> String {
        index < count - 1 ? "Next word" : "Start practice"
    }
}
