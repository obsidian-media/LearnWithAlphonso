import Foundation

/// What Settings' "Sign out" does when this account still has work in the offline queue.
///
/// Signing out no longer deletes queued rows (AccountDataCleanup keeps them, tagged with their owner, for when
/// the same account signs back in), but a learner who signs out and never comes back on this device would still
/// never see those lessons reach the server. So the button first tries to send them, and only asks when some
/// are still waiting.
public enum SignOutGuard {
    public enum Decision: Sendable, Equatable {
        /// Nothing is waiting: sign out at once.
        case signOut
        /// Something is still waiting after the drain attempt: ask first.
        case confirm(title: String, message: String)
    }

    public static func decide(pendingLessons: Int, pendingReviewAnswers: Int) -> Decision {
        let lessons = max(0, pendingLessons)
        let reviews = max(0, pendingReviewAnswers)
        guard lessons + reviews > 0 else { return .signOut }
        return .confirm(title: title(lessons: lessons, reviewAnswers: reviews), message: message)
    }

    /// "2 lessons haven't synced yet. Sign out anyway?" Lessons lead because they carry XP and the streak.
    static func title(lessons: Int, reviewAnswers: Int) -> String {
        let what: String
        switch (lessons, reviewAnswers) {
        case (0, let r): what = r == 1 ? "1 review answer hasn't" : "\(r) review answers haven't"
        case (let l, 0): what = l == 1 ? "1 lesson hasn't" : "\(l) lessons haven't"
        case (let l, let r):
            let lessonPart = l == 1 ? "1 lesson" : "\(l) lessons"
            let reviewPart = r == 1 ? "1 review answer" : "\(r) review answers"
            what = "\(lessonPart) and \(reviewPart) haven't"
        }
        return "\(what) synced yet. Sign out anyway?"
    }

    public static let message =
        "They stay on this iPhone and sync the next time you sign in here with this account. Signing in with a different account won't send them."
    public static let confirmTitle = "Sign out anyway"
    public static let cancelTitle = "Stay signed in"
}
