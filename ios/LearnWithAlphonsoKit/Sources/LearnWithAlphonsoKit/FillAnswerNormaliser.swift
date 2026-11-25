import Foundation

/// Port of `normaliseFillAnswer` (src/lib/srs.ts), step for step and in the same order, so a fill-in, reorder or
/// listening answer is judged the way the web and the server judge it: tests/fixtures/grading-parity.json pins
/// both. iOS keyboards type a curly apostrophe where the answer key has a straight one, and French typing inserts
/// no-break spaces. Used ONLY for fill-in-blank, reorder and listening; the speak and translate normalisers are
/// separate and must not change.
public func normaliseFillAnswer(_ value: String) -> String {
    // 1. NFC
    var s = value.precomposedStringWithCanonicalMapping
    // 2. Apostrophe look-alikes become '
    let lookAlikes: Set<Character> = [
        "\u{2018}", "\u{2019}", "\u{201A}", "\u{201B}", "\u{02BC}", "\u{02B9}", "\u{2032}", "\u{00B4}", "\u{0060}",
        "\u{FF07}",
    ]
    // Compare by scalar: a look-alike followed by a combining mark is one Character in Swift but is still the
    // look-alike code point to the web's per-code-unit replace.
    s = String(String.UnicodeScalarView(s.unicodeScalars.map { scalar in
        lookAlikes.contains(Character(scalar)) ? "'" : scalar
    }))
    // 3. Any run of Unicode whitespace (the JavaScript \s set, including no-break space) becomes one space
    s = s.replacingOccurrences(of: whitespaceRun, with: " ", options: .regularExpression)
    // 4. Spaces hugging an apostrophe go
    s = s.replacingOccurrences(of: " ?' ?", with: "'", options: .regularExpression)
    // 5. Trim (the same whitespace set), 6. lowercase
    s = trimJavaScriptWhitespace(s)
    return s.lowercased(with: Locale(identifier: "en_US_POSIX"))
}

/// The set JavaScript's `\s` and `String.prototype.trim` share.
private let javaScriptWhitespace: Set<Unicode.Scalar> = {
    var set: Set<Unicode.Scalar> = [
        "\u{09}", "\u{0A}", "\u{0B}", "\u{0C}", "\u{0D}", "\u{20}", "\u{A0}", "\u{1680}", "\u{2028}", "\u{2029}",
        "\u{202F}", "\u{205F}", "\u{3000}", "\u{FEFF}",
    ]
    for v in 0x2000...0x200A { set.insert(Unicode.Scalar(UInt32(v))!) }
    return set
}()

private let whitespaceRun =
    #"[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+"#

private func trimJavaScriptWhitespace(_ s: String) -> String {
    var scalars = Substring(s).unicodeScalars
    while let f = scalars.first, javaScriptWhitespace.contains(f) { scalars.removeFirst() }
    while let l = scalars.last, javaScriptWhitespace.contains(l) { scalars.removeLast() }
    return String(scalars)
}

/// Fill-in-blank, reorder and listening answers all compare this way, on both the learner's input and the key.
func fillAnswersMatch(_ picked: String, _ key: String) -> Bool {
    normaliseFillAnswer(picked) == normaliseFillAnswer(key)
}
