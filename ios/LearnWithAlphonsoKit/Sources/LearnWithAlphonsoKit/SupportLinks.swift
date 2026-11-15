import Foundation

/// The app screens a Help answer may point at ("Open the subscription screen"). The AI names one of these ids; it can
/// never write a URL. An id outside this list is dropped, never drawn as a link. Native twin of
/// src/lib/support-links.ts: the same ids, the same chip text and the same trailing-marker rule.
///
/// Where the id lives: the server stores an AI answer's link as a trailing marker in the body, `[[link:<id>]]`, and
/// normally lifts it into a `link` field before the learner's app sees the text. The app does not depend on that:
/// for an `ai` message it also reads and removes the marker itself, so the marker is never shown. The marker is
/// honoured for `ai` messages ONLY: a learner who types it gets their own text back, never a link, and a staff reply
/// is shown as written.
public enum SupportLinkID: String, CaseIterable, Sendable, Equatable {
    case subscription
    case aiFeatures = "ai-features"
    case settings
    case league

    /// The chip text, shared word for word with the web and Android.
    public var label: String {
        switch self {
        case .subscription: return "Open the subscription screen"
        case .aiFeatures: return "Open AI features"
        case .settings: return "Open Settings"
        case .league: return "Open your league"
        }
    }

    /// An id from the server, or nil when it is missing, not a string or not on the list.
    public init?(parsing value: Any?) {
        guard let raw = value as? String, let id = SupportLinkID(rawValue: raw) else { return nil }
        self = id
    }
}

public enum SupportLinks {
    /// A trailing `[[link:<id>]]` with its surrounding whitespace. Same pattern as the web's MARKER (`\z` is the end of
    /// the text; ICU's `$` would also match before a final newline).
    private static let marker = try! NSRegularExpression(pattern: #"\s*\[\[link:([^\]\s]*)\]\]\s*\z"#)

    /// An AI body split into its text and its link. An unknown id leaves no link; the marker never shows.
    public static func split(_ body: String) -> (text: String, link: SupportLinkID?) {
        let whole = NSRange(body.startIndex..., in: body)
        guard let match = marker.firstMatch(in: body, range: whole),
              let start = Range(match.range, in: body),
              let id = Range(match.range(at: 1), in: body)
        else { return (body, nil) }
        return (String(body[..<start.lowerBound]), SupportLinkID(rawValue: String(body[id])))
    }

    /// What a message shows and links to. Only an `ai` message is read for a marker, and its link is the
    /// server's `link` field when that holds an allowed id, else the one in the marker.
    public static func present(kind: SupportMessageKind, body: String, linkField: Any?) -> (body: String, link: SupportLinkID?) {
        guard kind == .ai else { return (body, nil) }
        let parts = split(body)
        return (parts.text, SupportLinkID(parsing: linkField) ?? parts.link)
    }
}
