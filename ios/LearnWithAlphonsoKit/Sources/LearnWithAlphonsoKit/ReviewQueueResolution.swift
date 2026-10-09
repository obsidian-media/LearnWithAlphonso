import Foundation

extension Question {
    /// The question's id. Ids are unique only within a lesson (see LessonReinforcement).
    public var questionID: String {
        switch self {
        case .multipleChoice(let q): return q.id
        case .fillInBlank(let q): return q.id
        case .reorder(let q): return q.id
        case .listening(let q): return q.id
        case .speak(let q): return q.id
        case .translate(let q): return q.id
        }
    }
}

public struct ResolvedReviewItem: Sendable {
    public let item: ReviewItem
    public let question: Question
}

public struct ReviewQueueResolutionResult: Sendable {
    public let resolved: [ResolvedReviewItem]
    /// Keys the bundled content cannot render (content updated since the item was scheduled, or another
    /// course's row). The view drops them from the due cache so the badge stops counting them.
    public let unresolvedItemKeys: [String]
}

/// The Review screen resolved each item only when it reached it, and skipped an unresolvable one with
/// `Color.clear.task { advance() }`. That fires once per view identity, so two unresolvable items in a row left
/// the screen blank with the course picker disabled. Resolving the whole queue first means the screen only ever
/// holds items it can render, and an all-unresolvable queue is simply empty ("All caught up").
public enum ReviewQueueResolution {
    public static func resolve(_ items: [ReviewItem], course: Course, content: ContentStore) -> ReviewQueueResolutionResult {
        var resolved: [ResolvedReviewItem] = []
        var unresolved: [String] = []
        for item in items {
            if let question = question(for: item, course: course, content: content) {
                resolved.append(ResolvedReviewItem(item: item, question: question))
            } else {
                unresolved.append(item.itemKey)
            }
        }
        return ReviewQueueResolutionResult(resolved: resolved, unresolvedItemKeys: unresolved)
    }

    private static func question(for item: ReviewItem, course: Course, content: ContentStore) -> Question? {
        if item.isSelfContained { return LearnWithAlphonsoKit.question(fromWeaknessItem: item) }
        guard let found = content.findLesson(id: item.lessonId, course: course) else { return nil }
        let questionID = String(item.itemKey.split(separator: ":").last ?? "")
        return found.lesson.questions.first { $0.questionID == questionID }
    }
}
