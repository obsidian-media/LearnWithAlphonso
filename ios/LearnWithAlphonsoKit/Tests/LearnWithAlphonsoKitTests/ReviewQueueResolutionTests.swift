import XCTest
@testable import LearnWithAlphonsoKit

final class ReviewQueueResolutionTests: XCTestCase {
    private func item(_ key: String, lesson: String = "u1l1", source: String = "lesson") -> ReviewItem {
        ReviewItem(itemKey: key, lessonId: lesson, level: "A1", ease: 2.5, intervalDays: 1, repetitions: 0, dueOn: "2026-10-08", source: source)
    }

    func testResolvableLessonItemsKeepTheirOrderAndQuestion() throws {
        let store = try ContentStore()
        let out = ReviewQueueResolution.resolve([item("u1l1:q2"), item("u1l1:q1")], course: .english, content: store)
        XCTAssertEqual(out.resolved.map(\.item.itemKey), ["u1l1:q2", "u1l1:q1"])
        XCTAssertEqual(out.resolved.map(\.question.questionID), ["q2", "q1"])
        XCTAssertEqual(out.unresolvedItemKeys, [])
    }

    /// Consecutive unresolvable items used to blank the screen. They now resolve to an empty queue, which
    /// ReviewQueueView renders as "All caught up".
    func testConsecutiveUnresolvableItemsResolveToEmpty() throws {
        let store = try ContentStore()
        let items = [item("u1l1:q99"), item("gone1:q1", lesson: "gone1"), item("u1l1:q98")]
        let out = ReviewQueueResolution.resolve(items, course: .english, content: store)
        XCTAssertTrue(out.resolved.isEmpty)
        XCTAssertEqual(out.unresolvedItemKeys, ["u1l1:q99", "gone1:q1", "u1l1:q98"])
    }

    func testUnresolvableItemsBetweenGoodOnesAreDroppedNotShown() throws {
        let store = try ContentStore()
        let out = ReviewQueueResolution.resolve([item("u1l1:q1"), item("u1l1:q99"), item("u1l1:q99b"), item("u1l1:q3")], course: .english, content: store)
        XCTAssertEqual(out.resolved.map(\.item.itemKey), ["u1l1:q1", "u1l1:q3"])
    }

    func testItemsOfAnotherCourseDoNotResolve() throws {
        let store = try ContentStore()
        let frenchLesson = try XCTUnwrap(store.bundle(for: .french).units.first?.lessons.first)
        let frenchQuestionID = try XCTUnwrap(frenchLesson.questions.first?.questionID)
        let key = "\(frenchLesson.id):\(frenchQuestionID)"
        XCTAssertEqual(ReviewQueueResolution.resolve([item(key, lesson: frenchLesson.id)], course: .french, content: store).resolved.count, 1)
        if store.findLesson(id: frenchLesson.id, course: .english) == nil {
            XCTAssertTrue(ReviewQueueResolution.resolve([item(key, lesson: frenchLesson.id)], course: .english, content: store).resolved.isEmpty)
        }
    }

    func testSelfContainedItemsResolveFromTheirOwnContent() throws {
        let store = try ContentStore()
        let weakness = ReviewItem(itemKey: "weakness:abc", lessonId: "weakness", level: "A1", ease: 2.5, intervalDays: 1, repetitions: 0,
                                  dueOn: "2026-10-08", source: "weakness", weaknessDisplay: "x", prompt: "Pick", choices: ["a", "b"], answerIndex: 0, explanation: "e")
        let broken = ReviewItem(itemKey: "weakness:def", lessonId: "weakness", level: "A1", ease: 2.5, intervalDays: 1, repetitions: 0,
                                dueOn: "2026-10-08", source: "weakness")
        let out = ReviewQueueResolution.resolve([weakness, broken], course: .english, content: store)
        XCTAssertEqual(out.resolved.map(\.item.itemKey), ["weakness:abc"])
        XCTAssertEqual(out.unresolvedItemKeys, ["weakness:def"])
    }
}
