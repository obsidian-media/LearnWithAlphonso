import XCTest
@testable import LearnWithAlphonsoKit

final class ReminderPromptPolicyTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let day: TimeInterval = 86_400
    private let fresh = ReminderPromptState()

    private func show(_ lessons: Int, _ permission: ReminderPermission = .notDetermined, _ state: ReminderPromptState? = nil, at: Date? = nil) -> Bool {
        ReminderPromptPolicy.shouldShowCard(completedLessons: lessons, permission: permission, state: state ?? fresh, now: at ?? now)
    }

    func testNoCardOnTheFirstCompletedLesson() {
        XCTAssertFalse(show(0))
        XCTAssertFalse(show(1))
    }

    func testCardFromTheSecondCompletedLesson() {
        XCTAssertTrue(show(2))
        XCTAssertTrue(show(9))
    }

    func testNoCardWhenPermissionIsAlreadyGrantedOrDenied() {
        XCTAssertFalse(show(5, .granted))
        XCTAssertFalse(show(5, .denied))
    }

    func testNotNowHidesTheCardForThreeDays() {
        let after = ReminderPromptPolicy.afterNotNow(fresh, now: now)
        XCTAssertFalse(show(5, .notDetermined, after, at: now))
        XCTAssertFalse(show(5, .notDetermined, after, at: now.addingTimeInterval(3 * day - 1)))
        XCTAssertTrue(show(5, .notDetermined, after, at: now.addingTimeInterval(3 * day)))
    }

    func testASecondNotNowEndsTheOffersForGood() {
        let once = ReminderPromptPolicy.afterNotNow(fresh, now: now)
        let twice = ReminderPromptPolicy.afterNotNow(once, now: now.addingTimeInterval(4 * day))
        XCTAssertEqual(twice.dismissals, 2)
        XCTAssertFalse(show(50, .notDetermined, twice, at: now.addingTimeInterval(400 * day)))
    }

    func testAClockSetBackwardsDoesNotReopenTheCardEarly() {
        let after = ReminderPromptPolicy.afterNotNow(fresh, now: now)
        XCTAssertFalse(show(5, .notDetermined, after, at: now.addingTimeInterval(-10 * day)))
    }

    func testStoreRoundTripsAndStartsFresh() {
        let suite = "ReminderPromptPolicyTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ReminderPromptStore(defaults: defaults)
        XCTAssertEqual(store.load(), ReminderPromptState())
        store.recordNotNow(now: now)
        XCTAssertEqual(store.load().dismissals, 1)
        XCTAssertEqual(store.load().lastDismissedAt, now)
        store.recordNotNow(now: now.addingTimeInterval(4 * day))
        XCTAssertEqual(store.load().dismissals, 2)
    }

    func testCopyHasNoEmDashes() {
        for line in [ReminderPromptCopy.title, ReminderPromptCopy.body, ReminderPromptCopy.accept, ReminderPromptCopy.decline] {
            XCTAssertFalse(line.contains("\u{2014}"))
        }
        XCTAssertEqual(ReminderPromptCopy.title, "Keep your streak going")
    }
}
