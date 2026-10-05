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
    /// "Letter" means exactly what the server's `\p{L}` means: Unicode general
    /// category L (upper, lower, title, modifier, other). Swift's
    /// `Character.isLetter` is Unicode *Alphabetic*, a superset that also takes
    /// Roman-numeral and circled letters, so a run could be linked here and then
    /// rejected by the server. A decomposed accent ("e" + U+0301) is one
    /// Character whose first scalar is the letter, so it still counts.
    private static func isLetter(_ character: Character) -> Bool {
        guard let first = character.unicodeScalars.first else { return false }
        switch first.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter:
            return true
        default:
            return false
        }
    }

    /// Concatenating every segment's text rebuilds `text` exactly.
    public static func segments(in text: String) -> [TextSegment] {
        let chars = Array(text)
        var result: [TextSegment] = []
        var current = ""
        var currentIsWord: Bool?

        for (i, ch) in chars.enumerated() {
            let isWordChar: Bool
            if isLetter(ch) {
                isWordChar = true
            } else if ch == "'" || ch == "\u{2019}" || ch == "-" {
                let prevIsLetter = i > 0 && isLetter(chars[i - 1])
                let nextIsLetter = i + 1 < chars.count && isLetter(chars[i + 1])
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
    private static let maxWord = 40

    /// Whether the server will accept `word`: 1 to 40 UTF-16 units AFTER NFC
    /// normalisation (the server normalises first, so 40 decomposed accents are
    /// fine). A longer run would open the save sheet only to fail.
    public static func isSavable(_ word: String) -> Bool {
        let units = word.precomposedStringWithCanonicalMapping.utf16.count
        return units >= 1 && units <= maxWord
    }

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

    /// Splits `text` into sentences, each with the Character offset it starts at
    /// (the same unit `segments(in:)` counts in), so a tap can be matched to the
    /// sentence it landed in.
    private static func splitSentences(_ text: String) -> [(text: String, start: Int)] {
        let terminators: Set<Character> = [".", "!", "?", "\n", "\u{2026}"]
        var sentences: [(text: String, start: Int)] = []
        var current = ""
        var start = 0
        var position = 0
        for ch in text {
            current.append(ch)
            position += 1
            if terminators.contains(ch) {
                sentences.append((current, start))
                current = ""
                start = position
            }
        }
        if !current.isEmpty { sentences.append((current, start)) }
        return sentences
    }

    /// The sentence in `text` that contains `word` as a whole word, trimmed and
    /// clamped to the server's 300-unit limit WITHOUT losing the word (the
    /// server rejects a sentence that does not contain it). Falls back to the
    /// whole text when no sentence matches. When the word occurs in several
    /// sentences this is the FIRST; use `sentence(containing:in:atOffset:)` to
    /// get the one that was actually tapped.
    public static func sentence(containing word: String, in text: String) -> String {
        let match = splitSentences(text).first { containsWholeWord(word, in: $0.text) }?.text ?? text
        return fit(match, around: word)
    }

    /// Like `sentence(containing:in:)`, but for the occurrence at `offset` (the
    /// Character offset of the tapped word within `text`), so a word that
    /// appears in two sentences saves the sentence it was tapped in, as the spec
    /// says ("the sentence it came from"). An offset that lands in no matching
    /// sentence falls back to the first one that has the word.
    public static func sentence(containing word: String, in text: String, atOffset offset: Int) -> String {
        let sentences = splitSentences(text)
        let tapped = sentences.first {
            offset >= $0.start && offset < $0.start + $0.text.count && containsWholeWord(word, in: $0.text)
        }
        let match = tapped?.text
            ?? sentences.first { containsWholeWord(word, in: $0.text) }?.text
            ?? text
        return fit(match, around: word)
    }

    /// Trims `sentence`, and if it is over the server's limit keeps a window
    /// around the first whole-word occurrence of `word`.
    private static func fit(_ sentence: String, around word: String) -> String {
        let trimmed = sentence.trimmingCharacters(in: .whitespacesAndNewlines)
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
/// `openURL` handling (`lwa-word://save?w=<word>&o=<offset>`). The offset is the
/// Character offset of the tapped word within the text it was tapped in, so the
/// right sentence can be chosen when a word occurs more than once.
public enum WordLink {
    public static let scheme = "lwa-word"

    public static func url(for word: String, offset: Int? = nil) -> URL? {
        var components = URLComponents()
        components.scheme = scheme
        components.host = "save"
        var items = [URLQueryItem(name: "w", value: word)]
        if let offset { items.append(URLQueryItem(name: "o", value: String(offset))) }
        components.queryItems = items
        return components.url
    }

    private static func queryItems(of url: URL) -> [URLQueryItem]? {
        guard url.scheme == scheme else { return nil }
        return URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
    }

    public static func word(from url: URL) -> String? {
        queryItems(of: url)?.first { $0.name == "w" }?.value
    }

    /// The tapped word's Character offset, or nil if absent or not a number.
    public static func offset(from url: URL) -> Int? {
        queryItems(of: url)?.first { $0.name == "o" }?.value.flatMap { Int($0) }
    }
}
