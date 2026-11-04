import Foundation

/// Direct port of src/data/vocab.ts's `deriveVocab` -- vocabulary isn't
/// separate content, it's derived from a lesson's own questions (the
/// answer + the authored `meaning`/`example` on the question, falling back to the
/// filled cloze sentence), so no new bundled JSON is
/// needed for the term/meaning/example fields: the existing
/// curriculum-en.json/curriculum-fr.json already carry everything those
/// need. `image` is the one field that does need separate bundled data --
/// see VocabImageRef below.
public struct VocabItem: Sendable, Equatable {
    public let term: String
    public let meaning: String
    public let example: String
    public let image: VocabImageRef?
}

/// Mirrors src/data/vocab-images.ts's `VocabImage` type exactly -- a
/// self-hosted, reviewed stock photo (URL/alt-text/credit plus provenance, no
/// image bytes bundled). Images load from the project's vocab-images bucket at
/// runtime via AsyncImage, same as the web's `<VocabImage>`.
public struct VocabImageRef: Decodable, Sendable, Equatable {
    public let url: String
    public let alt: String
    public let credit: String
    /// Provenance (App Store review fix, 2026-10). Optional so older bundles and
    /// test fixtures still decode; the web guard test requires them in data.
    public let source: String?
    public let sourcePageUrl: String?
    public let license: String?
    public let reviewedBy: String?
    public let reviewedAt: String?

    public init(
        url: String, alt: String, credit: String,
        source: String? = nil, sourcePageUrl: String? = nil, license: String? = nil,
        reviewedBy: String? = nil, reviewedAt: String? = nil
    ) {
        self.url = url
        self.alt = alt
        self.credit = credit
        self.source = source
        self.sourcePageUrl = sourcePageUrl
        self.license = license
        self.reviewedBy = reviewedBy
        self.reviewedAt = reviewedAt
    }
}

/// "reorder" questions are about sentence structure, not a single
/// vocabulary term -- their (whole-sentence) answer would make a
/// nonsense vocab card, so they contribute nothing here (the empty-term
/// guard in deriveVocab below skips them), same as vocab.ts's web mirror.
private func answerOf(_ question: Question) -> String {
    switch question {
    case .multipleChoice(let q):
        return q.choices.indices.contains(q.answer) ? q.choices[q.answer] : ""
    case .fillInBlank(let q):
        return q.answer
    case .reorder:
        return ""
    case .listening:
        // A whole-sentence answer, same as reorder -- it would make a nonsense
        // vocab card, so a listening lesson has no vocabulary step.
        return ""
    case .speak:
        // Likewise: the answer IS the whole phrase to say, and the web mirror
        // skips it the same way, so a speaking lesson has no vocabulary step.
        return ""
    case .translate:
        // And likewise again: a whole produced sentence, not a term.
        return ""
    }
}

/// Quiz instructions and pair-drill stems: filling their blank gives a label, not a
/// sentence. Mirrors the web's `STEM` in src/data/vocab.ts.
private let stemPattern = try! NSRegularExpression(
    pattern: "^(choose|which|select|complete|fill|plural of|opposite of|past (simple )?of|female form|male form|comparative|superlative|what is|what does|match)\\b",
    options: [.caseInsensitive]
)

/// A model sentence for the card, or "" when there is none to show. Mirrors the
/// web's `exampleOf`: only a cloze sentence with the answer put back in the blank
/// counts ("She ___ happy." -> "She is happy."). A pair-drill stem or an
/// instruction is not a sentence, and the old "prompt -> answer" example was the
/// quiz text, not an example.
private func exampleOf(_ question: Question) -> String {
    let answer = answerOf(question)
    let prompt: String
    switch question {
    case .fillInBlank(let q): prompt = q.prompt
    case .multipleChoice(let q): prompt = q.prompt
    case .reorder, .listening, .speak, .translate:
        // Unreachable in practice -- deriveVocab skips all five via
        // answerOf's empty term.
        return ""
    }
    guard let blank = prompt.range(of: "___"), !answer.isEmpty else { return "" }
    let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    let whole = NSRange(trimmed.startIndex..., in: trimmed)
    if stemPattern.firstMatch(in: trimmed, options: [], range: whole) != nil { return "" }
    let before = prompt[..<blank.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
    if let last = before.last, ":?…\"“".contains(last) { return "" }
    // Tidy the join, same steps as the web: drop every bracket hint after the blank,
    // drop the space the data leaves between the blank and its punctuation
    // ("taken ?"), and capitalise the first letter.
    var after = String(prompt[blank.upperBound...])
    after = after.replacingOccurrences(of: "\\s*\\([^)]*\\)", with: "", options: .regularExpression)
    after = after.replacingOccurrences(of: "^\\s+(?=[?!.,;:])", with: "", options: .regularExpression)
    let sentence = String(prompt[..<blank.lowerBound]) + answer + after
    return sentence.prefix(1).uppercased() + sentence.dropFirst()
}

/// The authored `meaning`/`example` on a question, trimmed, "" when none.
private func authored(_ question: Question) -> (meaning: String, example: String) {
    let pair: (String?, String?)
    switch question {
    case .multipleChoice(let q): pair = (q.meaning, q.example)
    case .fillInBlank(let q): pair = (q.meaning, q.example)
    default: pair = (nil, nil)
    }
    let ws = CharacterSet.whitespacesAndNewlines
    return ((pair.0 ?? "").trimmingCharacters(in: ws), (pair.1 ?? "").trimmingCharacters(in: ws))
}

/// Builds the vocabulary module for a lesson from its own questions,
/// deduping by term (case-insensitive) in question order. `images` is
/// keyed the same way (`term.lowercased()`, matching the web's
/// `titleCaseKey` despite its name) -- pass `ContentStore.vocabImages`,
/// or `[:]` where no image lookup is needed/available.
public func deriveVocab(lesson: Lesson, images: [String: VocabImageRef]) -> [VocabItem] {
    var seen: Set<String> = []
    var items: [VocabItem] = []
    for question in lesson.questions {
        let term = answerOf(question).trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { continue }
        let key = term.lowercased()
        guard !seen.contains(key) else { continue }
        seen.insert(key)
        let card = authored(question)
        items.append(VocabItem(
            term: term, meaning: card.meaning,
            example: card.example.isEmpty ? exampleOf(question) : card.example,
            image: images[key]))
    }
    return items
}
