import Foundation

/// Phrase mode ("Say it" in the phrasebook): how clearly a whole phrase came across. A one-for-one port of
/// src/lib/phrase-check.ts (web); the shared cases in phrase-check-cases.json pin every app to the same answers.
/// It never produces a pronunciation score: only "understood clearly", "mostly understood" (with up to two words to
/// listen to again) or "not yet". The rule numbers in the comments are the web file's.
///
/// Everything works on Unicode scalars, never on Characters, so a platform's own grapheme and whitespace rules cannot
/// leak into the answer.
public enum PhraseResult: String, Sendable, Equatable {
    case clear
    case mostly
    case notYet = "not_yet"
}

/// One word of the transcript with the recogniser's own confidence for it (0-1), as `/api/stt` forwards it.
public struct HeardWord: Sendable, Equatable {
    public let word: String
    public let confidence: Double

    public init(word: String, confidence: Double) {
        self.word = word
        self.confidence = confidence
    }
}

public struct PhraseCheck: Sendable, Equatable {
    public let result: PhraseResult
    /// At most `PhraseChecker.maxListenAgain` words, copied from the EXPECTED phrase in its own spelling; only for `.mostly`.
    public let listenAgain: [String]

    public init(result: PhraseResult, listenAgain: [String]) {
        self.result = result
        self.listenAgain = listenAgain
    }
}

public enum PhraseChecker {
    /// A heard word with a known confidence STRICTLY below this (0-1) counts as not clearly understood.
    public static let wordConfidence = 0.7
    /// "Mostly" names at most this many words, and never more than half of the phrase.
    public static let maxListenAgain = 2

    private static let droppedFragments: Set<String> = ["qu", "jusqu", "lorsqu", "puisqu", "quoiqu"]
    private static let gluedPrefixes: Set<String> = Set(["l", "d", "j", "m", "t", "s", "n", "c"]).union(droppedFragments)

    /// Rule 5's table: the value of each number word (EN, FR and ES together).
    static let numberWords: [String: Int] = [
        "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
        "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
        "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30,
        "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100,
        "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "sept": 7, "huit": 8, "neuf": 9,
        "dix": 10, "onze": 11, "douze": 12, "treize": 13, "quatorze": 14, "quinze": 15, "seize": 16,
        "vingt": 20, "trente": 30, "quarante": 40, "cinquante": 50, "soixante": 60, "cent": 100,
        "cero": 0, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7,
        "ocho": 8, "nueve": 9, "diez": 10, "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15,
        "dieciseis": 16, "diecisiete": 17, "dieciocho": 18, "diecinueve": 19, "veinte": 20, "treinta": 30,
        "cuarenta": 40, "cincuenta": 50, "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90, "cien": 100,
    ]

    private struct Token {
        let token: String
        let elided: Bool
    }

    private static let apostrophe: Unicode.Scalar = "'"

    /// Rule 2's exact whitespace list.
    private static func isWhitespace(_ v: UInt32) -> Bool {
        switch v {
        case 0x0009...0x000D, 0x0020, 0x0085, 0x00A0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F,
            0x3000, 0xFEFF:
            return true
        default:
            return false
        }
    }

    private static func isAllDigits(_ s: String) -> Bool {
        !s.isEmpty && s.unicodeScalars.allSatisfy { $0.value >= 0x30 && $0.value <= 0x39 }
    }

    /// Rule 1, with the elision marks kept.
    private static func tokenise(_ s: String) -> [Token] {
        // 1a. NFD, strip U+0300...U+036F, then lower-case (after the strip).
        var stripped = String.UnicodeScalarView()
        for u in s.decomposedStringWithCanonicalMapping.unicodeScalars where !(0x0300...0x036F).contains(u.value) {
            stripped.append(u)
        }
        let lowered = String(stripped).lowercased()
        // 1b + 1c. Quote variants, ligatures, then everything outside a-z 0-9 ' is a space.
        var mapped = String.UnicodeScalarView()
        for u in lowered.unicodeScalars {
            switch u.value {
            case 0x2019, 0x2018, 0x02BC, 0x0060, 0x00B4:
                mapped.append(apostrophe)
            case 0x0153:
                mapped.append("o")
                mapped.append("e")
            case 0x00E6:
                mapped.append("a")
                mapped.append("e")
            case 0x61...0x7A, 0x30...0x39, 0x27:
                mapped.append(u)
            default:
                mapped.append(" ")
            }
        }
        var out: [Token] = []
        for raw in String(mapped).split(separator: " ", omittingEmptySubsequences: true) {
            var piece = Array(raw.unicodeScalars)
            // 1d. A contraction ending is joined.
            for ending in ["t", "s", "m", "d", "ll", "re", "ve"] {
                let tail = Array(ending.unicodeScalars)
                let cut = piece.count - tail.count - 1
                guard cut >= 1, Array(piece[(cut + 1)...]) == tail, piece[cut] == apostrophe else { continue }
                let before = piece[cut - 1].value
                guard before != 0x27 else { continue }  // lookbehind wants [a-z0-9]; the only other kept scalar is '
                piece.remove(at: cut)
                break
            }
            // 1e. Remaining apostrophes split the piece (empty parts kept, as JS split does).
            let parts = String(String.UnicodeScalarView(piece)).split(separator: "'", omittingEmptySubsequences: false)
                .map(String.init)
            var elided = false
            for (i, part) in parts.enumerated() {
                let before = i < parts.count - 1
                if before && (part.unicodeScalars.count == 1 || droppedFragments.contains(part)) {
                    elided = true
                    continue
                }
                // 1f. Kept at 2+ characters, or all digits.
                if part.unicodeScalars.count >= 2 || isAllDigits(part) { out.append(Token(token: part, elided: elided)) }
                elided = false
            }
        }
        return out
    }

    /// Rule 1: the comparing tokens of a text.
    public static func tokens(_ s: String) -> [String] { tokenise(s).map(\.token) }

    private static func isShortDigits(_ s: String) -> Bool { isAllDigits(s) && s.unicodeScalars.count <= 3 }

    private static func numberMatches(_ a: String, _ b: String) -> Bool {
        if isShortDigits(a) && !isShortDigits(b) { return numberWords[b] == Int(a) }
        if isShortDigits(b) && !isShortDigits(a) { return numberWords[a] == Int(b) }
        return false
    }

    private static func claims(_ expected: Token, _ heard: String) -> Bool {
        if expected.token == heard { return true }
        if expected.elided, heard.count > expected.token.count, heard.hasSuffix(expected.token),
            gluedPrefixes.contains(String(heard.dropLast(expected.token.count)))
        {
            return true
        }
        return numberMatches(expected.token, heard)
    }

    private static func isLetterNumberOrMark(_ u: Unicode.Scalar) -> Bool {
        switch u.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
            .decimalNumber, .letterNumber, .otherNumber,
            .nonspacingMark, .spacingMark, .enclosingMark:
            return true
        default:
            return false
        }
    }

    /// Rule 2: the words of the expected phrase, each with the original spelling to show and its tokens.
    private static func expectedWords(_ expected: String) -> [(shown: String, tokens: [Token])] {
        var chunks: [[Unicode.Scalar]] = [[]]
        for u in expected.unicodeScalars {
            if isWhitespace(u.value) {
                if !chunks[chunks.count - 1].isEmpty { chunks.append([]) }
            } else {
                chunks[chunks.count - 1].append(u)
            }
        }
        var out: [(shown: String, tokens: [Token])] = []
        for chunk in chunks where !chunk.isEmpty {
            let text = String(String.UnicodeScalarView(chunk))
            let tokens = tokenise(text)
            if tokens.isEmpty { continue }
            var lo = 0
            var hi = chunk.count
            while lo < hi, !isLetterNumberOrMark(chunk[lo]) { lo += 1 }
            while hi > lo, !isLetterNumberOrMark(chunk[hi - 1]) { hi -= 1 }
            out.append((String(String.UnicodeScalarView(chunk[lo..<hi])), tokens))
        }
        return out
    }

    /// Rule 4's entry filter for a raw `/api/stt` `words` value: entries without a string `word` and a finite numeric
    /// `confidence` are skipped.
    public static func heardWords(from raw: Any?) -> [HeardWord]? {
        guard let list = raw as? [Any] else { return nil }
        var out: [HeardWord] = []
        for item in list {
            guard let dict = item as? [String: Any], let word = dict["word"] as? String,
                let value = dict["confidence"] as? Double, value.isFinite
            else { continue }
            out.append(HeardWord(word: word, confidence: value))
        }
        return out
    }

    /// How clearly `heard` conveyed `expected`, given the recogniser's per-word confidences (see the web file's rules).
    public static func check(expected: String, heard: String, words: [HeardWord]?) -> PhraseCheck {
        let want = expectedWords(expected)
        let said = tokens(heard)
        if want.isEmpty || said.isEmpty { return PhraseCheck(result: .notYet, listenAgain: []) }

        var queued: [String: [Double]] = [:]
        for w in words ?? [] where w.confidence.isFinite {
            for token in tokens(w.word) { queued[token, default: []].append(w.confidence) }
        }
        var unclaimed: [(token: String, confidence: Double?)] = said.map { token in
            guard var list = queued[token], !list.isEmpty else { return (token, nil) }
            let first = list.removeFirst()
            queued[token] = list
            return (token, first)
        }

        func unclear(_ c: Double?) -> Bool {
            guard let c else { return false }
            return c < wordConfidence
        }

        var flagged: [String] = []
        for (shown, wantTokens) in want {
            var bad = false
            let joined = wantTokens.count >= 2 ? wantTokens.map(\.token).joined() : nil
            let whole = joined.flatMap { j in unclaimed.firstIndex { $0.token == j } }
            if let whole {
                bad = unclear(unclaimed.remove(at: whole).confidence)
            } else {
                for token in wantTokens {
                    guard let at = unclaimed.firstIndex(where: { claims(token, $0.token) }) else {
                        bad = true
                        continue
                    }
                    if unclear(unclaimed.remove(at: at).confidence) { bad = true }
                }
            }
            if bad { flagged.append(shown) }
        }

        if flagged.isEmpty { return PhraseCheck(result: .clear, listenAgain: []) }
        if flagged.count <= maxListenAgain && flagged.count * 2 <= want.count {
            return PhraseCheck(result: .mostly, listenAgain: flagged)
        }
        return PhraseCheck(result: .notYet, listenAgain: [])
    }
}
