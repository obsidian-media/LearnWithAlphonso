import Foundation

/// The friend code in https://learn.alphonsoecosystem.app/invite/{code}, opened as a Universal Link or from a share.
/// Any web page can open that link, so the code is accepted only in the shape the server issues (letters and digits)
/// before it reaches the accept screen. Mirrors Android's InviteLink.
public enum FriendInviteLink {
    public static let host = "learn.alphonsoecosystem.app"

    /// The code for an invite URL, or nil for any other URL (another host, another path, an odd code).
    public static func code(from url: URL) -> String? {
        guard url.scheme == "https", url.host?.lowercased() == host else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count == 2, parts[0] == "invite" else { return nil }
        return isValidCode(parts[1]) ? parts[1] : nil
    }

    /// A pasted link or a bare code, for a code-entry field.
    public static func code(fromEntry text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: trimmed), url.scheme != nil { return code(from: url) }
        return isValidCode(trimmed) ? trimmed : nil
    }

    private static func isValidCode(_ s: String) -> Bool {
        (6...64).contains(s.count) && s.unicodeScalars.allSatisfy { ($0.value < 128) && (CharacterSet.alphanumerics.contains($0)) }
    }
}
