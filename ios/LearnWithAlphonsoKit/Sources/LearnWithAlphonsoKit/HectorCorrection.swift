import Foundation

/// A gentle fix for the learner's last message: the words they said (`slip`), the better words (`fix`) and an optional
/// one-line `note`. Hector's server returns it as its own JSON field; the same parser also runs over the assistant's reply
/// text as a second line of defence (the TypeScript, Swift and Kotlin ports replay shared/hector-corrections.json).
public struct HectorCorrection: Sendable, Equatable, Decodable {
    public let slip: String
    public let fix: String
    public let note: String?

    public init(slip: String, fix: String, note: String? = nil) {
        self.slip = slip
        self.fix = fix
        self.note = note
    }

    private enum CodingKeys: String, CodingKey { case slip, fix, note }

    /// Throws for anything that is not a valid correction, so a caller can drop it with `try?`.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let slip = try c.decode(String.self, forKey: .slip)
        let fix = try c.decode(String.self, forKey: .fix)
        let note = (try? c.decodeIfPresent(String.self, forKey: .note)) ?? nil
        guard let valid = HectorCorrections.validated(slip: slip, fix: fix, note: note) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "invalid correction"))
        }
        self = valid
    }
}

/// The rules (see src/lib/hector-correction.ts):
///  - Only an ASSISTANT reply is ever parsed; a learner's text is shown exactly as typed (`displayText`).
///  - Every complete `<correction>...</correction>` block is removed from the shown text. The FIRST block is the correction
///    (at most one per turn); a second is stripped and ignored. A first block that is not valid means no correction.
///  - Valid: a JSON object with non-empty `slip` and `fix` strings that differ; `note` optional. Malformed or partial
///    blocks are dropped silently.
///  - An unterminated block, and a trailing fragment of the opening tag, are removed so no half tag is ever visible.
public enum HectorCorrections {
    private static let open = "<correction>"
    private static let close = "</correction>"
    private static let slipMax = 200
    private static let fixMax = 200
    private static let noteMax = 300

    public static func validated(slip rawSlip: String, fix rawFix: String, note rawNote: String?) -> HectorCorrection? {
        let ws = CharacterSet.whitespacesAndNewlines
        let slip = rawSlip.trimmingCharacters(in: ws)
        let fix = rawFix.trimmingCharacters(in: ws)
        guard !slip.isEmpty, !fix.isEmpty, slip.utf16.count <= slipMax, fix.utf16.count <= fixMax else { return nil }
        guard slip.lowercased() != fix.lowercased() else { return nil }
        let note = (rawNote ?? "").trimmingCharacters(in: ws)
        guard note.utf16.count <= noteMax else { return nil }
        return HectorCorrection(slip: slip, fix: fix, note: note.isEmpty ? nil : note)
    }

    /// A parsed JSON value (the wire field, or a block's contents) as a correction, or nil.
    public static func validate(_ value: Any?) -> HectorCorrection? {
        guard let o = value as? [String: Any], let slip = o["slip"] as? String, let fix = o["fix"] as? String else { return nil }
        return validated(slip: slip, fix: fix, note: o["note"] as? String)
    }

    /// A finished assistant reply: the text to show and speak, and the correction when there is a valid one.
    public static func extract(_ raw: String) -> (text: String, correction: HectorCorrection?) {
        var correction: HectorCorrection?
        if let o = raw.range(of: open, options: .caseInsensitive),
           let c = raw.range(of: close, options: .caseInsensitive, range: o.upperBound..<raw.endIndex) {
            let inner = String(raw[o.upperBound..<c.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
            if let data = inner.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) {
                correction = validate(json)
            }
        }
        return (strip(raw, minPartial: 2), correction)
    }

    /// The visible part of an assistant reply that is still arriving: never a half tag, however the chunks fall.
    public static func visibleWhileStreaming(_ partial: String) -> String {
        strip(partial, minPartial: 1)
    }

    /// What a bubble shows: only the assistant's text is parsed; a learner's text is theirs, tags and all.
    public static func displayText(role: String, content: String) -> String {
        role == "assistant" ? extract(content).text : content
    }

    // MARK: - Stripping

    private static func strip(_ raw: String, minPartial: Int) -> String {
        var text = removeBlocks(raw)
        text = removeUnterminated(text)
        text = removePartialOpen(text, minimum: minPartial)
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func removeBlocks(_ raw: String) -> String {
        var result = ""
        var rest = raw
        while let o = rest.range(of: open, options: .caseInsensitive),
              let c = rest.range(of: close, options: .caseInsensitive, range: o.upperBound..<rest.endIndex) {
            result += rest[..<o.lowerBound]
            rest = String(rest[c.upperBound...])
        }
        return result + rest
    }

    private static func isWordCharacter(_ ch: Character) -> Bool {
        guard ch.isASCII else { return false }
        return ch.isLetter || ch.isNumber || ch == "_"
    }

    /// From an opening tag that never closed (`<correction` not followed by a word character) to the end.
    private static func removeUnterminated(_ text: String) -> String {
        var from = text.startIndex
        while let r = text.range(of: "<correction", options: .caseInsensitive, range: from..<text.endIndex) {
            if r.upperBound == text.endIndex || !isWordCharacter(text[r.upperBound]) {
                return String(text[..<r.lowerBound])
            }
            from = r.upperBound
        }
        return text
    }

    /// A trailing fragment of "<correction>" (a proper prefix, at least `minimum` characters).
    private static func removePartialOpen(_ text: String, minimum: Int) -> String {
        let maxLen = min(open.count - 1, text.count)
        guard maxLen >= minimum else { return text }
        for n in stride(from: maxLen, through: minimum, by: -1) {
            if open.hasPrefix(text.suffix(n).lowercased()) { return String(text.dropLast(n)) }
        }
        return text
    }
}
