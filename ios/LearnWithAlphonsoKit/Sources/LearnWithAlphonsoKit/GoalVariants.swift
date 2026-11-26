import Foundation

/// Goal-flavoured question variants (src/lib/goal-variants.ts is the source of the rules; this mirrors them).
/// A question may carry `goalVariants`: the same question (same id, type, skill, grammar point and answer shape)
/// written for a learner's goal. Lesson ids, question ids, counts and order never change, so progress and reviews
/// are untouched, and a build that predates the field simply shows the base question.
///
/// What a variant overrides on its question. `answer` is an index for a multiple-choice question and text for the
/// others, so it decodes into whichever it is.
public struct GoalVariant: Decodable, Sendable, Equatable {
    public let prompt: String?
    public let choices: [String]?
    public let answerIndex: Int?
    public let answerText: String?
    public let bank: [String]?
    public let acceptableAnswers: [String]?
    public let explanation: String?
    public let audioText: String?

    public init(
        prompt: String? = nil, choices: [String]? = nil, answerIndex: Int? = nil, answerText: String? = nil,
        bank: [String]? = nil, acceptableAnswers: [String]? = nil, explanation: String? = nil,
        audioText: String? = nil
    ) {
        self.prompt = prompt
        self.choices = choices
        self.answerIndex = answerIndex
        self.answerText = answerText
        self.bank = bank
        self.acceptableAnswers = acceptableAnswers
        self.explanation = explanation
        self.audioText = audioText
    }

    private enum CodingKeys: String, CodingKey {
        case prompt, choices, answer, bank, acceptableAnswers, explanation, audioText
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        prompt = try c.decodeIfPresent(String.self, forKey: .prompt)
        choices = try c.decodeIfPresent([String].self, forKey: .choices)
        bank = try c.decodeIfPresent([String].self, forKey: .bank)
        acceptableAnswers = try c.decodeIfPresent([String].self, forKey: .acceptableAnswers)
        explanation = try c.decodeIfPresent(String.self, forKey: .explanation)
        audioText = try c.decodeIfPresent(String.self, forKey: .audioText)
        if let index = try? c.decode(Int.self, forKey: .answer) {
            answerIndex = index
            answerText = nil
        } else {
            answerIndex = nil
            answerText = try c.decodeIfPresent(String.self, forKey: .answer)
        }
    }
}

extension Question {
    /// The question's variants by goal, nil when it has none.
    public var goalVariants: [String: GoalVariant]? {
        switch self {
        case .multipleChoice(let q): return q.goalVariants
        case .fillInBlank(let q): return q.goalVariants
        case .listening(let q): return q.goalVariants
        case .speak(let q): return q.goalVariants
        case .translate(let q): return q.goalVariants
        case .reorder: return nil
        }
    }

    /// What the player shows a learner with this goal: the variant laid over the question when it has one for the
    /// goal, else the question itself. Apply it before any shuffling, as the web does.
    public func resolved(forGoal goal: String?) -> Question {
        guard let goal, let variant = goalVariants?[goal] else { return self }
        return applying(variant)
    }

    /// Whether the question has a version written for this goal (the "For your goal" tag).
    public func hasVariant(forGoal goal: String?) -> Bool {
        guard let goal else { return false }
        return goalVariants?[goal] != nil
    }

    /// The version the learner was shown, named by the goal the client sends with its answer (`variantGoal`; nil for
    /// the base question, which is all a build that predates variants ever shows). Nil when the question has no
    /// version for that goal. Grading accepts the base and THIS version only, never another goal's.
    func shownVersion(_ variantGoal: String?) -> Question? {
        guard let variantGoal, let variant = goalVariants?[variantGoal] else { return nil }
        return applying(variant)
    }

    /// The variant's fields laid over this question. The variants stay on the result so grading still sees them,
    /// and a variant with a different answer drops the base answer's vocab card fields.
    func applying(_ v: GoalVariant) -> Question {
        switch self {
        case .multipleChoice(let q):
            let choices = v.choices ?? q.choices
            let answer = v.answerIndex ?? q.answer
            let sameAnswer =
                choices.indices.contains(answer) && q.choices.indices.contains(q.answer)
                && choices[answer] == q.choices[q.answer]
            return .multipleChoice(Question.MultipleChoice(
                id: q.id, prompt: v.prompt ?? q.prompt, choices: choices, answer: answer,
                explanation: v.explanation ?? q.explanation,
                imageKey: sameAnswer ? q.imageKey : nil, audioText: q.audioText,
                meaning: sameAnswer ? q.meaning : nil, example: sameAnswer ? q.example : nil,
                term: sameAnswer ? q.term : nil, goalVariants: q.goalVariants))
        case .fillInBlank(let q):
            let answer = v.answerText ?? q.answer
            let sameAnswer = answer == q.answer
            return .fillInBlank(Question.FillInBlank(
                id: q.id, prompt: v.prompt ?? q.prompt, bank: v.bank ?? q.bank, answer: answer,
                explanation: v.explanation ?? q.explanation,
                meaning: sameAnswer ? q.meaning : nil, example: sameAnswer ? q.example : nil,
                term: sameAnswer ? q.term : nil, goalVariants: q.goalVariants))
        case .listening(let q):
            return .listening(Question.Listening(
                id: q.id, prompt: v.prompt ?? q.prompt, audioText: v.audioText ?? q.audioText,
                choices: v.choices ?? q.choices, answer: v.answerText ?? q.answer,
                explanation: v.explanation ?? q.explanation, goalVariants: q.goalVariants))
        case .speak(let q):
            return .speak(Question.Speak(
                id: q.id, prompt: v.prompt ?? q.prompt, answer: v.answerText ?? q.answer,
                explanation: v.explanation ?? q.explanation, goalVariants: q.goalVariants))
        case .translate(let q):
            return .translate(Question.Translate(
                id: q.id, prompt: v.prompt ?? q.prompt,
                acceptableAnswers: v.acceptableAnswers ?? q.acceptableAnswers,
                explanation: v.explanation ?? q.explanation, goalVariants: q.goalVariants))
        case .reorder:
            return self
        }
    }
}

extension Lesson {
    /// The lesson with every question resolved for the goal. Ids, count and order never change.
    public func resolved(forGoal goal: String?) -> Lesson {
        guard let goal else { return self }
        return Lesson(id: id, title: title, subtitle: subtitle, questions: questions.map { $0.resolved(forGoal: goal) })
    }
}

/// How a queued answer remembers which goal-flavoured version it was given. The stored rows (SwiftData) have no column
/// for it and a new column would need a schema migration, so the goal rides inside the stored answer text as a
/// prefix of control characters, which no learner can type: "\u{1}travel\u{1}I take a taxi." Rows written before this
/// have no prefix and decode as the base question's answer, which is what those builds showed.
public enum VariantGoalTag {
    private static let mark = "\u{1}"

    public static func encode(_ text: String, goal: String?) -> String {
        guard let goal, !goal.isEmpty, !goal.contains(mark) else { return text }
        return mark + goal + mark + text
    }

    public static func decode(_ stored: String) -> (text: String, goal: String?) {
        guard stored.hasPrefix(mark) else { return (stored, nil) }
        let rest = stored.dropFirst()
        guard let end = rest.firstIndex(of: Character(mark)) else { return (stored, nil) }
        let goal = String(rest[rest.startIndex..<end])
        return (String(rest[rest.index(after: end)...]), goal.isEmpty ? nil : goal)
    }
}
