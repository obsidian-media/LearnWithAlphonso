import XCTest
@testable import LearnWithAlphonsoKit

final class NotificationLogicTests: XCTestCase {
    // MARK: - nextStreakReminderDate

    private var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private func utcDate(_ iso: String) -> Date {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZZZZZ"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter.date(from: iso)!
    }

    func testReturnsNilWhenTheUserAlreadyCompletedALessonToday() {
        let now = utcDate("2026-09-13T10:00:00+00:00")
        let result = nextStreakReminderDate(lastActiveDate: "2026-09-13", now: now, calendar: utcCalendar)
        XCTAssertNil(result)
    }

    func testSchedulesLaterTodayAt8pmWhenNowIsBeforeThat() {
        let now = utcDate("2026-09-13T10:00:00+00:00")
        let result = nextStreakReminderDate(lastActiveDate: "2026-09-12", now: now, calendar: utcCalendar)
        XCTAssertEqual(result, utcDate("2026-09-13T20:00:00+00:00"))
    }

    func testSchedulesTomorrowAt8pmWhenNowIsAlreadyPast8pmToday() {
        let now = utcDate("2026-09-13T21:00:00+00:00")
        let result = nextStreakReminderDate(lastActiveDate: "2026-09-12", now: now, calendar: utcCalendar)
        XCTAssertEqual(result, utcDate("2026-09-14T20:00:00+00:00"))
    }

    func testSchedulesTodayAt8pmOnFirstEverActivityWhenLastActiveDateIsNil() {
        let now = utcDate("2026-09-13T09:00:00+00:00")
        let result = nextStreakReminderDate(lastActiveDate: nil, now: now, calendar: utcCalendar)
        XCTAssertEqual(result, utcDate("2026-09-13T20:00:00+00:00"))
    }

    func testTreatsExactly8pmAsAlreadyPastSoItSchedulesTomorrow() {
        let now = utcDate("2026-09-13T20:00:00+00:00")
        let result = nextStreakReminderDate(lastActiveDate: "2026-09-12", now: now, calendar: utcCalendar)
        XCTAssertEqual(result, utcDate("2026-09-14T20:00:00+00:00"))
    }

    // MARK: - dueReviewCount

    private func reviewItem(dueOn: String) -> ReviewItem {
        ReviewItem(itemKey: "en:lesson-1:q1", lessonId: "lesson-1", level: "A1", ease: 2.3, intervalDays: 1, repetitions: 1, dueOn: dueOn)
    }

    func testCountsItemsDueExactlyToday() {
        let items = [reviewItem(dueOn: "2026-09-13"), reviewItem(dueOn: "2026-09-13")]
        XCTAssertEqual(dueReviewCount(from: items, today: "2026-09-13"), 2)
    }

    func testCountsItemsOverdueFromBeforeToday() {
        let items = [reviewItem(dueOn: "2026-09-10")]
        XCTAssertEqual(dueReviewCount(from: items, today: "2026-09-13"), 1)
    }

    func testExcludesItemsNotYetDue() {
        let items = [reviewItem(dueOn: "2026-09-14")]
        XCTAssertEqual(dueReviewCount(from: items, today: "2026-09-13"), 0)
    }

    func testReturnsZeroForAnEmptyQueue() {
        XCTAssertEqual(dueReviewCount(from: [], today: "2026-09-13"), 0)
    }

    // MARK: - weaknessPracticeNudgeCopy

    func testReturnsNilWhenThereAreNoOpenCategories() {
        XCTAssertNil(weaknessPracticeNudgeCopy(openCategories: []))
    }

    func testNamesOnlyTheFirstOpenCategoryHumanized() {
        let copy = weaknessPracticeNudgeCopy(openCategories: ["past-tense", "articles"])
        XCTAssertEqual(copy?.title, "A quick practice moment")
        XCTAssertTrue(copy!.body.contains("past tense"))
        XCTAssertFalse(copy!.body.contains("articles"))
    }

    // MARK: - nextWeaknessPracticeNudgeDate

    func testSchedulesLaterTodayAt10amWhenNowIsBeforeThat() {
        let now = utcDate("2026-09-13T08:00:00+00:00")
        let result = nextWeaknessPracticeNudgeDate(now: now, calendar: utcCalendar)
        XCTAssertEqual(result, utcDate("2026-09-13T10:00:00+00:00"))
    }

    func testSchedulesTomorrowAt10amWhenNowIsAlreadyPast10amToday() {
        let now = utcDate("2026-09-13T15:00:00+00:00")
        let result = nextWeaknessPracticeNudgeDate(now: now, calendar: utcCalendar)
        XCTAssertEqual(result, utcDate("2026-09-14T10:00:00+00:00"))
    }

    func testTreatsExactly10amAsAlreadyPastSoItSchedulesTomorrow() {
        let now = utcDate("2026-09-13T10:00:00+00:00")
        let result = nextWeaknessPracticeNudgeDate(now: now, calendar: utcCalendar)
        XCTAssertEqual(result, utcDate("2026-09-14T10:00:00+00:00"))
    }
}
