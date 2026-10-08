import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Wording for every reason code the team, duel and weekly-quest RPCs return, word-for-word
/// src/lib/social-reason.fixtures.json (pinned by SocialReasonCopyTests). A view never shows a raw code.
public enum SocialReasonCopy {
    public static let generic = "Something went wrong. Try again."
    public static let nameSaveFailed = "Couldn't save your name. Try again."

    private static let reasons: [String: String] = [
        "unauthenticated": "Sign in again to continue.",
        "invalid-name": "That name is too short or too long.",
        "blocked-content": Copy.nameNotAllowed,
        "invalid-visibility": "Choose whether the team is public or private.",
        "invalid-member-cap": "A team can have 2 to 200 members.",
        "switch-locked": "You can't join or leave a team for a few days. Try again later.",
        "team-not-found": "That team no longer exists.",
        "team-full": "That team is full. Try another one.",
        "invalid-code": "That code doesn't match a team. Check it and try again.",
        "not-on-a-team": "You're not on a team.",
        "cannot-kick-yourself": "To leave the team, use Leave team.",
        "not-team-owner": "Only the team's owner can do that.",
        "member-not-found": "That person isn't on your team anymore.",
        "ownership-transferred": "You left the team. The member who joined earliest now runs it.",
        "team-disbanded": "You left the team. It was closed because no one else was in it.",
        "cannot-duel-yourself": "You can't challenge yourself.",
        "blocked": "You can't do that with this person.",
        "not-friends": "You can only challenge friends.",
        "duel-already-open": "You already have a duel open with this friend.",
        "not-found": "That duel is no longer open.",
        "invalid-week": "This week's quests have reset. Refresh and try again.",
        "unknown-quest": "That quest isn't available anymore.",
        "not-yet-completed": "Finish the quest first, then claim it.",
        "already-claimed": "You've already claimed this quest this week.",
        "invalid-course": "Pick one of your courses and try again.",
        "no-course-progress": "Start this course first, then claim the quest.",
        "unknown-error": "Something went wrong. Try again.",
        "server-error": "Something went wrong on our side. Try again.",
    ]

    public static var knownCodes: Set<String> { Set(reasons.keys) }
    public static func isKnown(_ code: String) -> Bool { reasons[code] != nil }

    /// `nil` means the request itself failed, so the connection copy; a code this build does not know is generic.
    public static func message(for code: String?) -> String {
        guard let code else { return Copy.connectionFailure }
        return reasons[code] ?? generic
    }

    /// Copy for a thrown error: offline only when it really is the connection.
    public static func failureMessage(for error: Error) -> String {
        if error is URLError { return Copy.connectionFailure }
        switch error as? ProgressSyncError {
        case .badResponse?:
            return Copy.connectionFailure
        case .server(let status, _)? where status == 401:
            return message(for: "unauthenticated")
        default:
            return generic
        }
    }

    /// The line after blocking a teammate. get_team_members hides a blocked member from everyone except the
    /// team owner, who still sees them (marked Blocked) so they can remove them.
    public static func teamBlockedLine(_ name: String, viewerIsOwner: Bool) -> String {
        viewerIsOwner
            ? "\(name) is blocked. They stay in your team list, shown as Blocked, so you can remove them. They can't friend you or challenge you to a duel."
            : "\(name) is blocked. They won't appear in your team list, and they can't friend you or challenge you to a duel."
    }

    /// Copy for a failed display-name save (confirm_display_name raises P0001 with the code as the message; a
    /// direct PATCH raises 23514 "blocked-content" or the length CHECK).
    public static func nameSaveMessage(for error: Error) -> String {
        if error is URLError { return Copy.connectionFailure }
        if case .server(_, let message?)? = error as? ProgressSyncError {
            if message == "blocked-content" || message == "invalid-name" || message == "unauthenticated" {
                return self.message(for: message)
            }
            if message.contains("profiles_display_name_length_chk") { return self.message(for: "invalid-name") }
        }
        // An expired or missing session: retrying cannot help, signing in again can.
        if case .server(let status, _)? = error as? ProgressSyncError, status == 401 { return self.message(for: "unauthenticated") }
        if case .badResponse? = error as? ProgressSyncError { return Copy.connectionFailure }
        return nameSaveFailed
    }
}
