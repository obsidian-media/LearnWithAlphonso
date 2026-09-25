import Foundation

/// Comparing a Spanish speech-to-text transcript against the phrase the
/// learner was asked to say.
///
/// A hand-kept port of src/lib/spoken-answer-es.ts, which also has a Deno
/// copy in supabase/functions/grade-review. A sibling of SpokenAnswer.swift
/// and SpokenAnswerFr.swift, not an extension of either -- see
/// SpokenAnswerFr.swift's header for why (every call site already knows its
/// course, and each language's rule list stays intact and legible on its
/// own rather than becoming a flag-branch on English's).
///
/// UNVERIFIED AGAINST REAL PRODUCTION TRANSCRIPTS -- see
/// spoken-answer-es.ts's header comment for the full reasoning. Treat every
/// rule below as a hypothesis to confirm once Spanish speak content is live.
///
/// What this deliberately does NOT attempt, per
/// docs/superpowers/specs/2026-09-25-spanish-content-audit-design.md §6.1:
/// seseo/ceceo, the b/v merger, and yeísmo are genuine phonemic mergers for
/// most Spanish speakers -- two different words pronounced identically, so
/// no normalisation rule can recover which one a learner meant. That is a
/// content-authoring constraint, not a bug this module could fix.
public enum SpokenAnswerEs {
    /// Deliberately just "eh" -- other candidates ("este", "o sea", "bueno")
    /// are also real words in common use, so stripping them risks
    /// corrupting a genuine answer.
    private static let filler = "\\b(?:eh)\\b"

    /// Single-word Spanish numbers only. Every number 0-29 is a single word
    /// (dieciséis, veintidós, etc.), and the round tens/hundred/thousand
    /// (treinta, ..., noventa, cien, mil) are single words too. True
    /// compounds start at 31 ("treinta y uno"), excluded here. `un`/`una`
    /// ("one") are deliberately omitted: it is also the indefinite article
    /// in the overwhelming majority of its occurrences, and mapping it
    /// unconditionally would turn "un gato" (a cat) into "1 gato" -- the
    /// exact bare-word hazard SpokenAnswerFr's numberWords comment names for
    /// un/une.
    ///
    /// Written unaccented (dieciseis, veintidos, veintitres, veintiseis)
    /// because `normalise` folds accents BEFORE this list runs -- an
    /// accented pattern would never match the already-folded input.
    private static let numberWords: [(String, String)] = [
        ("\\bcero\\b", "0"), ("\\bdos\\b", "2"), ("\\btres\\b", "3"), ("\\bcuatro\\b", "4"),
        ("\\bcinco\\b", "5"), ("\\bseis\\b", "6"), ("\\bsiete\\b", "7"), ("\\bocho\\b", "8"),
        ("\\bnueve\\b", "9"), ("\\bdiez\\b", "10"), ("\\bonce\\b", "11"), ("\\bdoce\\b", "12"),
        ("\\btrece\\b", "13"), ("\\bcatorce\\b", "14"), ("\\bquince\\b", "15"),
        ("\\bdieciseis\\b", "16"), ("\\bdiecisiete\\b", "17"), ("\\bdieciocho\\b", "18"),
        ("\\bdiecinueve\\b", "19"), ("\\bveinte\\b", "20"), ("\\bveintiuno\\b", "21"),
        ("\\bveintidos\\b", "22"), ("\\bveintitres\\b", "23"), ("\\bveinticuatro\\b", "24"),
        ("\\bveinticinco\\b", "25"), ("\\bveintiseis\\b", "26"), ("\\bveintisiete\\b", "27"),
        ("\\bveintiocho\\b", "28"), ("\\bveintinueve\\b", "29"), ("\\btreinta\\b", "30"),
        ("\\bcuarenta\\b", "40"), ("\\bcincuenta\\b", "50"), ("\\bsesenta\\b", "60"),
        ("\\bsetenta\\b", "70"), ("\\bochenta\\b", "80"), ("\\bnoventa\\b", "90"),
        ("\\bcien\\b", "100"), ("\\bmil\\b", "1000"),
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
        var s = input.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_ES"))
            .lowercased()
        // Filler before the silent-h strip, not after: "eh" IS an h-word, so
        // stripping the h first would turn it into "e" and the filler regex
        // would never see the whole word "eh" to match against.
        s = replacing(s, filler, with: " ")
        // Spanish "h" is silent in every position except inside the digraph
        // "ch" (its own consonant sound) -- `(?<!c)h` matches an h NOT
        // immediately preceded by c, so "hola"/"ahora" lose their h but
        // "chico"/"coche" keep it.
        s = replacing(s, "(?<!c)h", with: "")
        for (pattern, replacement) in numberWords {
            s = replacing(s, pattern, with: replacement)
        }
        s = replacing(s, "[^a-z0-9\\s]", with: " ")
        s = replacing(s, "\\s+", with: " ")
        return s.trimmingCharacters(in: .whitespaces)
    }

    /// Whether `transcript` is the learner saying `expected`, in Spanish.
    public static func matches(transcript: String, expected: String) -> Bool {
        let said = normalise(transcript)
        if said.isEmpty { return false }
        return said == normalise(expected)
    }
}
