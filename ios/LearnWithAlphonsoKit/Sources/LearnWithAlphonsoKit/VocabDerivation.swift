import Foundation

/// Direct port of src/lib/vocab.ts's `deriveVocab` -- vocabulary isn't
/// separate content, it's derived from a lesson's own questions (the
/// answer + explanation + a model sentence), so no new bundled JSON is
/// needed: the existing curriculum-en.json/curriculum-fr.json already
/// carry everything this needs. Stock-photo lookup (VOCAB_IMAGES on the
/// web) is deliberately not ported yet -- `image` is always nil here;
/// see the V2 offline-first/vocab-images follow-up note in
/// ARCHITECTURE.md before assuming this needs porting too.
public struct VocabItem: Sendable, Equatable {
    public let term: String
    public let meaning: String
    public let example: String
}

private func answerOf(_ question: Question) -> String {
    switch question {
    case .multipleChoice(let q):
        return q.choices.indices.contains(q.answer) ? q.choices[q.answer] : ""
    case .fillInBlank(let q):
        return q.answer
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
    }
}

/// Builds the vocabulary module for a lesson from its own questions,
/// deduping by term (case-insensitive) in question order.
public func deriveVocab(lesson: Lesson) -> [VocabItem] {
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
        }
        items.append(VocabItem(term: term, meaning: explanation, example: exampleOf(question)))
    }
    return items
}
