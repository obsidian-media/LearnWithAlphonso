import Foundation

/// Comparing a speech-to-text transcript against the phrase the learner was
/// asked to say.
///
/// A hand-kept port of src/lib/spoken-answer.ts, which also has a Deno copy in
/// supabase/functions/grade-review. Three copies is not a happy number, but the
/// rule has to hold in three runtimes: this app grades optimistically for
/// immediate feedback, and the server re-derives the same verdict afterwards.
/// If they disagree the learner is congratulated and then has the item lapsed
/// behind their back, which is invisible from either side alone. The vectors in
/// SpokenAnswerTests are the same vectors as the TypeScript and Deno tests, and
/// that is what keeps the three honest.
///
/// Deliberately NOT edit distance: a threshold loose enough to forgive
/// "she is"/"she's" also accepts "he is a driver" for "she is a doctor".
enum SpokenAnswer {
    /// Expanded rather than contracted, so "don't" and "do not" converge.
    private static let contractions: [(String, String)] = [
        ("\\bcan't\\b", "can not"),
        ("\\bwon't\\b", "will not"),
        ("\\bn't\\b", " not"),
        ("\\b'll\\b", " will"),
        ("\\b're\\b", " are"),
        ("\\b've\\b", " have"),
        ("\\b'd\\b", " would"),
        // Possessive and "is" share this form; spoken practice uses it as "is",
        // and treating a possessive as "is" only ever makes two spellings of
        // the same utterance agree.
        ("\\b's\\b", " is"),
        ("\\b'm\\b", " am"),
    ]

    /// The same contractions WITHOUT an apostrophe, which is how speech
    /// recognition frequently returns them ("shes a doctor"). Every key is a
    /// non-word in English deliberately: expanding "were" or "well" would
    /// corrupt real words, so those forms are left alone. Under-matching costs
    /// a retry; over-matching marks a wrong answer right.
    private static let apostropheLess: [(String, String)] = [
        ("\\bcant\\b", "can not"),
        ("\\bwont\\b", "will not"),
        ("\\bdont\\b", "do not"),
        ("\\bdoesnt\\b", "does not"),
        ("\\bdidnt\\b", "did not"),
        ("\\bisnt\\b", "is not"),
        ("\\barent\\b", "are not"),
        ("\\bwasnt\\b", "was not"),
        ("\\bwerent\\b", "were not"),
        ("\\bhasnt\\b", "has not"),
        ("\\bhavent\\b", "have not"),
        ("\\bhadnt\\b", "had not"),
        ("\\bcouldnt\\b", "could not"),
        ("\\bwouldnt\\b", "would not"),
        ("\\bshouldnt\\b", "should not"),
        ("\\bshes\\b", "she is"),
        ("\\bhes\\b", "he is"),
        ("\\btheres\\b", "there is"),
        ("\\bthats\\b", "that is"),
        ("\\bwhats\\b", "what is"),
        ("\\blets\\b", "let us"),
        ("\\bim\\b", "i am"),
        ("\\bive\\b", "i have"),
        ("\\byoure\\b", "you are"),
        ("\\btheyre\\b", "they are"),
        ("\\byouve\\b", "you have"),
        ("\\bweve\\b", "we have"),
    ]

    /// Hesitation noises the recogniser transcribes but nobody means to say.
    private static let filler = "\\b(?:um|uh|erm|er|ah)\\b"

    /// Number words collapsed onto digits, because /api/stt calls Deepgram with
    /// `smart_format=true`, which returns spoken numbers as numerals: say "the
    /// bus leaves at nine" and the transcript reads "the bus leaves at 9".
    /// Single words only -- compound numbers cannot be reconciled this way, so
    /// spoken content avoids them.
    private static let numberWords: [(String, String)] = [
        ("\\bzero\\b", "0"), ("\\bone\\b", "1"), ("\\btwo\\b", "2"), ("\\bthree\\b", "3"),
        ("\\bfour\\b", "4"), ("\\bfive\\b", "5"), ("\\bsix\\b", "6"), ("\\bseven\\b", "7"),
        ("\\beight\\b", "8"), ("\\bnine\\b", "9"), ("\\bten\\b", "10"), ("\\beleven\\b", "11"),
        ("\\btwelve\\b", "12"), ("\\bthirteen\\b", "13"), ("\\bfourteen\\b", "14"),
        ("\\bfifteen\\b", "15"), ("\\bsixteen\\b", "16"), ("\\bseventeen\\b", "17"),
        ("\\beighteen\\b", "18"), ("\\bnineteen\\b", "19"), ("\\btwenty\\b", "20"),
        ("\\bthirty\\b", "30"), ("\\bforty\\b", "40"), ("\\bfifty\\b", "50"),
        ("\\bsixty\\b", "60"), ("\\bseventy\\b", "70"), ("\\beighty\\b", "80"),
        ("\\bninety\\b", "90"),
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

    static func normalise(_ input: String) -> String {
        var s = input.lowercased()
        // Expand while the apostrophes are still present...
        for (pattern, replacement) in contractions {
            s = replacing(s, pattern, with: replacement)
        }
        s = replacing(s, "['\u{2019}]", with: "")
        // ...then again for the apostrophe-less spellings recognition emits.
        for (pattern, replacement) in apostropheLess {
            s = replacing(s, pattern, with: replacement)
        }
        s = replacing(s, filler, with: " ")
        for (pattern, replacement) in numberWords {
            s = replacing(s, pattern, with: replacement)
        }
        s = replacing(s, "[^a-z0-9\\s]", with: " ")
        s = replacing(s, "\\s+", with: " ")
        return s.trimmingCharacters(in: .whitespaces)
    }

    /// Whether `transcript` is the learner saying `expected`.
    ///
    /// An empty transcript is false -- but it means "nothing was captured",
    /// not "said it wrong", and callers must not spend a heart on it. Recording
    /// failures reach here looking identical to silence, which is why the
    /// speaking UI never submits one.
    static func matches(transcript: String, expected: String) -> Bool {
        let said = normalise(transcript)
        if said.isEmpty { return false }
        return said == normalise(expected)
    }
}
