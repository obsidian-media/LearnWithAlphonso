import XCTest
@testable import LearnWithAlphonsoKit

final class LeaderboardEngagementTests: XCTestCase {
    // MARK: - wasOvertaken

    func testDetectsBeingOvertakenByAPreviouslyLowerRankedFriend() {
        let previous = [
            LeaderboardSnapshotEntry(userID: "me", xp: 100),
            LeaderboardSnapshotEntry(userID: "rival", xp: 80),
        ]
        let current = [
            LeaderboardSnapshotEntry(userID: "rival", xp: 150),
            LeaderboardSnapshotEntry(userID: "me", xp: 100),
        ]

        XCTAssertTrue(wasOvertaken(previous: previous, current: current, me: "me"))
    }

    func testNoOvertakeWhenRankOrderIsUnchanged() {
        let previous = [
            LeaderboardSnapshotEntry(userID: "me", xp: 100),
            LeaderboardSnapshotEntry(userID: "rival", xp: 80),
        ]
        let current = [
            LeaderboardSnapshotEntry(userID: "me", xp: 120),
            LeaderboardSnapshotEntry(userID: "rival", xp: 90),
        ]

        XCTAssertFalse(wasOvertaken(previous: previous, current: current, me: "me"))
    }

    func testSomeoneNewToTheBoardAboveMeIsNotCountedAsAnOvertake() {
        let previous = [
            LeaderboardSnapshotEntry(userID: "me", xp: 100),
        ]
        let current = [
            LeaderboardSnapshotEntry(userID: "newcomer", xp: 500),
            LeaderboardSnapshotEntry(userID: "me", xp: 100),
        ]

        XCTAssertFalse(wasOvertaken(previous: previous, current: current, me: "me"))
    }

    func testReturnsFalseWhenMeIsMissingFromEitherSnapshot() {
        let entries = [LeaderboardSnapshotEntry(userID: "rival", xp: 80)]
        XCTAssertFalse(wasOvertaken(previous: entries, current: entries, me: "me"))
        XCTAssertFalse(wasOvertaken(previous: [], current: [LeaderboardSnapshotEntry(userID: "me", xp: 1)], me: "me"))
    }

    // MARK: - nextWeeklyRecapDate

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

    func testSchedulesLaterTodayWhenNowIsMondayBeforeTheHour() {
        // 2026-09-21 is a Monday.
        let now = utcDate("2026-09-21T06:00:00+00:00")
        let result = nextWeeklyRecapDate(now: now, hour: 9, calendar: utcCalendar)
        XCTAssertEqual(result, utcDate("2026-09-21T09:00:00+00:00"))
    }

    func testSchedulesNextMondayWhenNowIsMondayAfterTheHour() {
        let now = utcDate("2026-09-21T10:00:00+00:00")
        let result = nextWeeklyRecapDate(now: now, hour: 9, calendar: utcCalendar)
        XCTAssertEqual(result, utcDate("2026-09-28T09:00:00+00:00"))
    }

    func testSchedulesTheUpcomingMondayFromAMidweekDay() {
        // 2026-09-23 is a Wednesday.
        let now = utcDate("2026-09-23T12:00:00+00:00")
        let result = nextWeeklyRecapDate(now: now, hour: 9, calendar: utcCalendar)
        XCTAssertEqual(result, utcDate("2026-09-28T09:00:00+00:00"))
    }

    func testSchedulesTheUpcomingMondayFromASunday() {
        // 2026-09-27 is a Sunday.
        let now = utcDate("2026-09-27T12:00:00+00:00")
        let result = nextWeeklyRecapDate(now: now, hour: 9, calendar: utcCalendar)
        XCTAssertEqual(result, utcDate("2026-09-28T09:00:00+00:00"))
    }
}
