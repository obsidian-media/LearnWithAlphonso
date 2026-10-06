import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// The wording must match the web card (src/components/GoalCard.tsx); change both together.
final class GoalCopyTests: XCTestCase {
    private func plan(
        status: GoalStatus = .onTrack, realism: GoalRealism = .ok, required: Int = 10, recent: Int = 10,
        inScope: Int = 30, remaining: Int = 20, suggested: String? = nil
    ) -> GoalPlan {
        GoalPlan(
            currentLevel: "A1", targetLevel: "B1", targetDate: "2026-12-01", lessonsInScope: inScope,
            lessonsRemaining: remaining, lessonsDoneLast7Days: recent, requiredPerWeek: required,
            status: status, realism: realism, suggestedDate: suggested, asOf: "2026-10-06T12:00:00.000Z")
    }

    private func utc(_ y: Int, _ m: Int, _ d: Int) -> Date {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c.date(from: DateComponents(year: y, month: m, day: d, hour: 12))!
    }

    func testFormatDateIsAFixedEnglishDayMonthYearInUTC() {
        XCTAssertEqual(GoalCopy.formatDate("2026-11-10"), "10 Nov 2026")
        XCTAssertEqual(GoalCopy.formatDate("2026-09-05"), "5 Sep 2026")
        XCTAssertEqual(GoalCopy.formatDate("2027-01-01"), "1 Jan 2027")
        XCTAssertEqual(GoalCopy.formatDate("not a date"), "not a date")
        XCTAssertEqual(GoalCopy.formatDate("2026-13-40"), "2026-13-40")
        // A day the month does not have must not roll over into the next month.
        XCTAssertEqual(GoalCopy.formatDate("2026-02-30"), "2026-02-30")
    }

    func testHeadlineAndProgress() {
        let goal = StoredGoal(course: "en", targetLevel: "B1", targetDate: "2026-12-01", createdAt: "x")
        XCTAssertEqual(GoalCopy.headline(for: goal), "Finish B1 by 1 Dec 2026")
        XCTAssertEqual(GoalCopy.progress(for: plan(inScope: 30, remaining: 20)), "10 of 30 lessons done")
    }

    func testStatusLinesMatchTheWebCard() {
        XCTAssertEqual(GoalCopy.statusLine(for: .done), "Goal reached.")
        XCTAssertEqual(GoalCopy.statusLine(for: .expired), "The date has passed. Pick a new date to keep going.")
        XCTAssertEqual(GoalCopy.statusLine(for: .justStarted), "Just started. Check back next week.")
        XCTAssertEqual(GoalCopy.statusLine(for: .ahead), "Ahead of plan.")
        XCTAssertEqual(GoalCopy.statusLine(for: .onTrack), "On track.")
        XCTAssertEqual(GoalCopy.statusLine(for: .behind), "Behind plan.")
        XCTAssertFalse(GoalCopy.statusLine(for: .unknown).isEmpty)
    }

    func testTheWeeklyLineIsHiddenWhenDoneOrExpired() {
        XCTAssertEqual(
            GoalCopy.weeklyLine(for: plan(status: .behind, required: 13, recent: 5)),
            "13 lessons a week to finish on time; 5 in the last 7 days.")
        XCTAssertNil(GoalCopy.weeklyLine(for: plan(status: .done)))
        XCTAssertNil(GoalCopy.weeklyLine(for: plan(status: .expired)))
    }

    func testThePreviewLineIsTheBareWeeklyNumber() {
        XCTAssertEqual(GoalCopy.previewLines(for: plan(required: 12, remaining: 20)).perWeek, "12 lessons a week")
        XCTAssertEqual(GoalCopy.previewLines(for: plan(required: 12, remaining: 20)).left, "20 lessons left to finish B1.")
    }

    func testTheSuggestionAppearsWheneverTheServerSentOne() {
        XCTAssertEqual(
            GoalCopy.suggestionLine(for: plan(status: .behind, suggested: "2026-11-10")),
            "At your recent pace, 10 Nov 2026 is realistic.")
        XCTAssertEqual(
            GoalCopy.suggestionLine(for: plan(status: .expired, suggested: "2027-01-12")),
            "At your recent pace, 12 Jan 2027 is realistic.")
        XCTAssertNil(GoalCopy.suggestionLine(for: plan(status: .behind, suggested: nil)))
    }

    func testRealismLinesDoNotRepeatTheSuggestion() {
        XCTAssertNil(GoalCopy.realismLine(for: plan(realism: .ok)))
        XCTAssertEqual(GoalCopy.realismLine(for: plan(realism: .ambitious)), "Ambitious: about two lessons a day or more.")
        XCTAssertEqual(GoalCopy.realismLine(for: plan(realism: .unrealistic, suggested: "2026-11-10")), "Unrealistic for most learners at this date.")
    }

    func testOfflineWithNothingCachedDoesNotPromiseAPlan() {
        XCTAssertEqual(GoalCopy.loadFailureMessage(.offline, hadCachedPlan: true), LearningGoalError.offline.userMessage)
        XCTAssertEqual(GoalCopy.loadFailureMessage(.offline, hadCachedPlan: false), "You're offline. Connect to load your goal.")
        XCTAssertEqual(GoalCopy.loadFailureMessage(.unavailable, hadCachedPlan: false), LearningGoalError.unavailable.userMessage)
        XCTAssertEqual(GoalCopy.loadFailureMessage(.notSignedIn, hadCachedPlan: true), LearningGoalError.notSignedIn.userMessage)
    }

    func testAFailedActionNeverSaysItIsShowingAPlan() {
        // Save and Remove failures appear next to a plan that IS on screen; "showing your last saved
        // plan" describes a load, not an action that did not happen.
        XCTAssertEqual(
            GoalCopy.actionFailureMessage(.offline), "You're offline. Try again when you're connected.")
        XCTAssertEqual(GoalCopy.actionFailureMessage(.unavailable), LearningGoalError.unavailable.userMessage)
        XCTAssertEqual(GoalCopy.actionFailureMessage(.notSignedIn), LearningGoalError.notSignedIn.userMessage)
        XCTAssertEqual(GoalCopy.actionFailureMessage(.invalid("That level is below yours")), "That level is below yours")
    }

    func testTheEstimateNote() {
        XCTAssertEqual(GoalCopy.estimateNote, "An estimate of lessons, not of fluency.")
    }

    func testMonthPresetsClampToTheEndOfAShorterMonth() {
        XCTAssertEqual(GoalCopy.monthsFromToday(6, now: utc(2026, 10, 6)), "2027-04-06")
        XCTAssertEqual(GoalCopy.monthsFromToday(6, now: utc(2026, 8, 31)), "2027-02-28")
        XCTAssertEqual(GoalCopy.monthsFromToday(3, now: utc(2026, 11, 30)), "2027-02-28")
        XCTAssertEqual(GoalCopy.monthsFromToday(12, now: utc(2027, 2, 28)), "2028-02-28")
        XCTAssertEqual(GoalCopy.monthsFromToday(12, now: utc(2027, 3, 31)), "2028-03-31")
        // Leap day: 29 Feb 2028 + 12 months has no 29 Feb in 2029.
        XCTAssertEqual(GoalCopy.monthsFromToday(12, now: utc(2028, 2, 29)), "2029-02-28")
    }

    func testDayConversionsAreUTCAndRoundTrip() throws {
        XCTAssertEqual(GoalCopy.day(from: utc(2026, 10, 6)), "2026-10-06")
        // 23:30 UTC is still the 6th, whatever the device time zone is.
        let lateUTC = Date(timeIntervalSince1970: 1_791_243_000) // 2026-10-05T23:30:00Z
        XCTAssertEqual(GoalCopy.day(from: lateUTC), "2026-10-05")
        let date = try XCTUnwrap(GoalCopy.date(fromDay: "2027-02-28"))
        XCTAssertEqual(GoalCopy.day(from: date), "2027-02-28")
        // Noon UTC, so a date picker in any time zone (up to +-12h) shows the same calendar day.
        XCTAssertEqual(date.timeIntervalSince1970.truncatingRemainder(dividingBy: 86_400), 43_200)
        XCTAssertNil(GoalCopy.date(fromDay: "2027-02-30"))
        XCTAssertNil(GoalCopy.date(fromDay: "soon"))
    }

    func testTomorrowIsTheNextUTCDay() {
        XCTAssertEqual(GoalCopy.tomorrow(now: utc(2026, 10, 6)), "2026-10-07")
        XCTAssertEqual(GoalCopy.tomorrow(now: utc(2026, 12, 31)), "2027-01-01")
    }
}
