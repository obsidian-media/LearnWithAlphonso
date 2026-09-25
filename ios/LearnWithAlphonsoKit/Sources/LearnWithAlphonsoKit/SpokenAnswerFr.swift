import Foundation

/// Comparing a French speech-to-text transcript against the phrase the
/// learner was asked to say.
///
/// A hand-kept port of src/lib/spoken-answer-fr.ts, which also has a Deno
/// copy in supabase/functions/grade-review. A sibling of SpokenAnswer.swift,
/// not an extension of it -- see that module's header for why (English's
/// rules encode auxiliary-verb contractions, French elision is a
/// phonological rule about vowel-initial boundaries, and every call site
/// already knows its course).
///
/// UNVERIFIED AGAINST REAL PRODUCTION TRANSCRIPTS -- see
/// spoken-answer-fr.ts's header comment for the full reasoning. Treat every
/// rule below as a hypothesis to confirm once French speak content is live.
public enum SpokenAnswerFr {
    private static let elidable = [
        "j", "m", "t", "s", "l", "d", "n", "c", "qu", "jusqu", "lorsqu", "puisqu", "quoiqu",
    ]
    private static let vowelOrMuteH = "aeiouyàâäéèêëïîôöùûüh"

    private static var elisionSpaceJoins: [(String, String)] {
        elidable.map { clitic in
            ("\\b\(clitic) (?=[\(vowelOrMuteH)])", clitic)
        }
    }

    /// `si` elides only before "il"/"ils" -- not before any vowel-initial
    /// word ("si elle" never becomes "s'elle") -- so it is its own narrow
    /// rule rather than a member of `elidable`.
    private static let siElision: [(String, String)] = [
        ("\\bsi (ils?)\\b", "s $1")
    ]

    /// Deliberately just "euh"/"hum" -- other candidates ("ben", "quoi",
    /// "genre") are also real words in common use, so stripping them risks
    /// corrupting a genuine answer.
    private static let filler = "\\b(?:euh|hum)\\b"

    /// Single-word French numbers only. dix-sept/dix-huit/dix-neuf (17-19)
    /// are excluded as two-word compounds (unlike English's one-word
    /// seventeen/eighteen/nineteen), and soixante-dix/quatre-vingts/
    /// quatre-vingt-dix (70/80/90) are excluded per the design spec.
    /// `un`/`une` ("one") are deliberately omitted: it is also the
    /// indefinite article in the overwhelming majority of its occurrences,
    /// and mapping it unconditionally would turn "un chat" (a cat) into
    /// "1 chat" -- the exact bare-word hazard the design spec names by name.
    private static let numberWords: [(String, String)] = [
        ("\\bzéro\\b", "0"), ("\\bdeux\\b", "2"), ("\\btrois\\b", "3"), ("\\bquatre\\b", "4"),
        ("\\bcinq\\b", "5"), ("\\bsix\\b", "6"), ("\\bsept\\b", "7"), ("\\bhuit\\b", "8"),
        ("\\bneuf\\b", "9"), ("\\bdix\\b", "10"), ("\\bonze\\b", "11"), ("\\bdouze\\b", "12"),
        ("\\btreize\\b", "13"), ("\\bquatorze\\b", "14"), ("\\bquinze\\b", "15"),
        ("\\bseize\\b", "16"), ("\\bvingt\\b", "20"), ("\\btrente\\b", "30"),
        ("\\bquarante\\b", "40"), ("\\bcinquante\\b", "50"), ("\\bsoixante\\b", "60"),
        ("\\bcent\\b", "100"), ("\\bmille\\b", "1000"),
    ]

    private static func replacing(_ input: String, _ pattern: String, with replacement: String)
        -> String
    {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return input }
        return regex.stringByReplacingMatches(
            in: input,
            range: NSRange(input.startIndex..., in: input),
            withTemplate: replacement
        )
    }

    public static func normalise(_ input: String) -> String {
        var s = input.folding(options: .diacriticInsensitive, locale: Locale(identifier: "fr_FR"))
            .lowercased()
        for (pattern, replacement) in siElision {
            s = replacing(s, pattern, with: replacement)
        }
        for (pattern, replacement) in elisionSpaceJoins {
            s = replacing(s, pattern, with: replacement)
        }
        s = replacing(s, "['\u{2019}]", with: "")
        s = replacing(s, filler, with: " ")
        for (pattern, replacement) in numberWords {
            s = replacing(s, pattern, with: replacement)
        }
        s = replacing(s, "[^a-z0-9\\s]", with: " ")
        s = replacing(s, "\\s+", with: " ")
        return s.trimmingCharacters(in: .whitespaces)
    }

    /// Whether `transcript` is the learner saying `expected`, in French.
    public static func matches(transcript: String, expected: String) -> Bool {
        let said = normalise(transcript)
        if said.isEmpty { return false }
        return said == normalise(expected)
    }
}
