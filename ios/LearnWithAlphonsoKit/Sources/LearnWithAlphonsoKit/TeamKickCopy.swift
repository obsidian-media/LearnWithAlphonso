import Foundation

/// The confirmation a team owner sees before removing someone. Removing used to happen on a single tap
/// of an unlabeled icon in the member list.
public enum TeamKickCopy {
    public static func title(memberName: String) -> String { "Remove \(memberName) from the team?" }
    public static let message = "They leave the team right away and lose access to its missions."
    public static let confirm = "Remove"
    public static func buttonLabel(memberName: String) -> String { "Remove \(memberName) from the team" }
}
