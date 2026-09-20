import Foundation

/// V3 package 3b -- "tutor persona memory." Hector's own conversation
/// content lives entirely on AlphonsoEcosystem's Cloud Voice backend,
/// which this repo cannot read or modify (see docs/superpowers/specs/
/// 2026-09-20-hector-weakness-detection-design.md's "What this does NOT
/// change" section) -- there is no transcript to literally recall.
///
/// What this repo *does* durably know about a learner, independent of any
/// one Hector session, is their CEFR level and open weakness categories
/// (`weakness_events`, see ProgressSyncClient.fetchWeaknessTrend). This
/// gives Hector continuity across separate sessions by priming each new
/// one with those facts as a leading history entry -- not a fabricated
/// memory of past conversation, but real, current, durable state about
/// the learner.
public enum TutorMemoryContext {
    /// Builds the priming entry, or `nil` when there's nothing worth
    /// priming (a brand-new learner with no CEFR level and no weakness
    /// history yet). `openWeaknessCategories` should already be filtered
    /// to open ones and ordered most-relevant-first; only the first 3 are
    /// used to keep the prompt short.
    public static func buildPrimingMessage(
        cefrLevel: String?,
        openWeaknessCategories: [String]
    ) -> TutorConversationMessage? {
        var parts: [String] = []
        if let cefrLevel, !cefrLevel.isEmpty {
            parts.append("their current English level is \(cefrLevel)")
        }
        let topCategories = openWeaknessCategories.prefix(3)
        if !topCategories.isEmpty {
            let humanized = topCategories.map { $0.replacingOccurrences(of: "-", with: " ") }
            parts.append("they've recently been working on: \(humanized.joined(separator: ", "))")
        }
        guard !parts.isEmpty else { return nil }

        let content =
            "[Background for you, the tutor, not part of what the learner said: "
            + parts.joined(separator: "; ")
            + ". Use this naturally if it's relevant, but don't just recite it back.]"
        return TutorConversationMessage(role: "user", content: content)
    }
}
