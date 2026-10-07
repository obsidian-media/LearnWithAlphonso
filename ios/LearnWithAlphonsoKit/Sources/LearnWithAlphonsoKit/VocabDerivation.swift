import Foundation

/// Direct port of src/data/vocab.ts's `deriveVocab` -- vocabulary isn't
/// separate content, it's derived from a lesson's own questions (the
/// answer + explanation + a model sentence), so no new bundled JSON is
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
    /// Provenance (App Store remediation W1). Optional so older bundles and
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

/// Mirrors the web's `prompt.replace(/[:：]\s*$/, "")` -- strip trailing
/// whitespace, then a trailing ':' or full-width '：' if present.
private func stripTrailingColon(_ prompt: String) -> String {
    var result = prompt
    while let last = result.last, last.isWhitespace {
        result.removeLast()
    }
    if result.last == ":" || result.last == "：" {
        result.removeLast()
    }
    return result
}

private func exampleOf(_ question: Question) -> String {
    let answer = answerOf(question)
    switch question {
    case .fillInBlank(let q):
        let filled = q.prompt.replacingOccurrences(of: "___", with: answer)
        return filled == q.prompt ? "\(q.prompt) \(answer)" : filled
    case .multipleChoice(let q):
        return "\(stripTrailingColon(q.prompt)) \u{2192} \(answer)"
    case .reorder, .listening, .speak, .translate:
        // Unreachable in practice -- deriveVocab skips all five via
        // answerOf's empty term.
        return ""
    }
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
        let explanation: String
        switch question {
        case .multipleChoice(let q): explanation = q.explanation
        case .fillInBlank(let q): explanation = q.explanation
        case .reorder(let q): explanation = q.explanation
        case .listening(let q): explanation = q.explanation
        case .speak(let q): explanation = q.explanation
        case .translate(let q): explanation = q.explanation
        }
        items.append(VocabItem(term: term, meaning: explanation, example: exampleOf(question), image: images[key]))
    }
    return items
}
