import Foundation

/// A run of text that is either one word or the non-word text between words.
public struct TextSegment: Equatable, Sendable {
    public let text: String
    public let isWord: Bool
    public init(text: String, isWord: Bool) {
        self.text = text
        self.isWord = isWord
    }
}

/// Pure text tools for tap-to-save, kept in the Kit so they are unit-tested
/// without UIKit. A "word" is a run of letters; an apostrophe (straight or
/// typographic) or hyphen counts as part of a word only when it sits between
/// two letters, so `don't`, `l'été` and `well-known` stay whole while a lone
/// hyphen or a trailing apostrophe does not. Digits are never words.
public enum WordSegmenter {
    /// Concatenating every segment's text rebuilds `text` exactly.
    public static func segments(in text: String) -> [TextSegment] {
        let chars = Array(text)
        var result: [TextSegment] = []
        var current = ""
        var currentIsWord: Bool?

        for (i, ch) in chars.enumerated() {
            let isWordChar: Bool
            if ch.isLetter {
                isWordChar = true
            } else if ch == "'" || ch == "\u{2019}" || ch == "-" {
                let prevIsLetter = i > 0 && chars[i - 1].isLetter
                let nextIsLetter = i + 1 < chars.count && chars[i + 1].isLetter
                isWordChar = prevIsLetter && nextIsLetter
            } else {
                isWordChar = false
            }

            if currentIsWord == isWordChar {
                current.append(ch)
            } else {
                if let kind = currentIsWord, !current.isEmpty {
                    result.append(TextSegment(text: current, isWord: kind))
                }
                current = String(ch)
                currentIsWord = isWordChar
            }
        }
        if let kind = currentIsWord, !current.isEmpty {
            result.append(TextSegment(text: current, isWord: kind))
        }
        return result
    }

    private static let maxSentence = 300

    /// Same folding the server uses to compare a word with a sentence's tokens:
    /// case-insensitive, with a typographic apostrophe equal to a straight one.
    /// (Swift's `==` already treats composed and decomposed accents as equal.)
    private static func fold(_ text: String) -> String {
        text.lowercased().replacingOccurrences(of: "\u{2019}", with: "'")
    }

    /// Whether `word` appears in `text` as a WHOLE word. The server requires
    /// exactly this ("he" is not found in "the"), so the client must pick its
    /// sentence the same way or the request is rejected.
    private static func containsWholeWord(_ word: String, in text: String) -> Bool {
        let target = fold(word)
        return segments(in: text).contains { $0.isWord && fold($0.text) == target }
    }

    /// The sentence in `text` that contains `word` as a whole word, trimmed and
    /// clamped to the server's 300-character limit WITHOUT losing the word
    /// (the server rejects a sentence that does not contain it). Falls back to
    /// the whole text when no sentence matches.
    public static func sentence(containing word: String, in text: String) -> String {
        let terminators: Set<Character> = [".", "!", "?", "\n", "\u{2026}"]
        var sentences: [String] = []
        var current = ""
        for ch in text {
            current.append(ch)
            if terminators.contains(ch) {
                sentences.append(current)
                current = ""
            }
        }
        if !current.isEmpty { sentences.append(current) }

        let match = sentences.first { containsWholeWord(word, in: $0) } ?? text
        let trimmed = match.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count <= maxSentence { return trimmed }

        // Too long: keep a 300-character window around the first WHOLE-word
        // occurrence (not the first substring hit, which may be inside another word).
        let target = fold(word)
        var offset = 0
        var wordStart: Int?
        for segment in segments(in: trimmed) {
            if segment.isWord && fold(segment.text) == target {
                wordStart = offset
                break
            }
            offset += segment.text.count
        }
        guard let wordStart else { return String(trimmed.prefix(maxSentence)) }
        let lo = max(0, min(wordStart - 120, trimmed.count - maxSentence))
        let start = trimmed.index(trimmed.startIndex, offsetBy: lo)
        let end = trimmed.index(start, offsetBy: maxSentence)
        return String(trimmed[start..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// The custom-scheme link that carries a tapped word through SwiftUI's
/// `openURL` handling (`lwa-word://save?w=<word>`).
public enum WordLink {
    public static let scheme = "lwa-word"

    public static func url(for word: String) -> URL? {
        var components = URLComponents()
        components.scheme = scheme
        components.host = "save"
        components.queryItems = [URLQueryItem(name: "w", value: word)]
        return components.url
    }

    public static func word(from url: URL) -> String? {
        guard url.scheme == scheme,
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        else { return nil }
        return items.first { $0.name == "w" }?.value
    }
}
