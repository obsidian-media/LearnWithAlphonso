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
        // The server's limit is JavaScript `.length`, i.e. UTF-16 code units,
        // NOT Swift Characters: an emoji is 1 Character but 2 units (a family
        // emoji, 8), so counting Characters would let an emoji-heavy sentence
        // through that the server then rejects (CodeRabbit review on PR #212).
        if trimmed.utf16.count <= maxSentence { return trimmed }

        // Too long: find the first WHOLE-word occurrence (not the first
        // substring hit, which may be inside another word), then grow a window
        // outward from it one Character at a time, left then right, while it
        // stays within the UTF-16 budget. The word is in the window by
        // construction. With no occurrence the window simply grows from the start.
        let chars = Array(trimmed)
        let target = fold(word)
        var offset = 0
        var wordRange: Range<Int>?
        for segment in segments(in: trimmed) {
            let length = segment.text.count
            if segment.isWord && fold(segment.text) == target {
                wordRange = offset..<(offset + length)
                break
            }
            offset += length
        }
        var lo = wordRange?.lowerBound ?? 0
        var hi = wordRange?.upperBound ?? 0
        var used = chars[lo..<hi].reduce(0) { $0 + units($1) }
        var grew = true
        while grew {
            grew = false
            if lo > 0, used + units(chars[lo - 1]) <= maxSentence {
                lo -= 1
                used += units(chars[lo])
                grew = true
            }
            if hi < chars.count, used + units(chars[hi]) <= maxSentence {
                used += units(chars[hi])
                hi += 1
                grew = true
            }
        }
        return String(chars[lo..<hi]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// UTF-16 code units in one Character -- what JavaScript's `.length` counts.
    private static func units(_ character: Character) -> Int {
        String(character).utf16.count
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
