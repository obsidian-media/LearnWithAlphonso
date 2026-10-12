import Foundation

/// The Learn-tab line shown while finished lessons or review answers are still waiting to reach the server.
/// Queued work is safe, but without this the learner cannot tell "saved on this phone" from "saved", and has
/// no way to ask for a retry.
public enum PendingSyncNotice {
    public static let syncNowTitle = "Sync now"
    public static let syncingTitle = "Syncing…"

    /// nil when nothing is waiting, so the line is hidden.
    public static func message(lessons: Int, reviewAnswers: Int, isConnected: Bool) -> String? {
        var parts: [String] = []
        if lessons > 0 { parts.append(lessons == 1 ? "1 lesson" : "\(lessons) lessons") }
        if reviewAnswers > 0 { parts.append(reviewAnswers == 1 ? "1 review answer" : "\(reviewAnswers) review answers") }
        guard !parts.isEmpty else { return nil }
        let one = lessons + reviewAnswers == 1
        let waiting = "\(parts.joined(separator: " and ")) \(one ? "is" : "are") saved on this phone and waiting to sync."
        return isConnected ? waiting : "\(waiting) \(one ? "It" : "They") will sync when you're back online."
    }
}
