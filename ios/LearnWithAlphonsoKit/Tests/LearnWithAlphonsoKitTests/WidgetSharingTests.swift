import XCTest
@testable import LearnWithAlphonsoKit

final class WidgetSharingTests: XCTestCase {
    private let fixedNow = Date(timeIntervalSince1970: 1_700_000_000) // 2023-11-14T22:13:20Z

    func testClearSnapshotRemovesOnlyTheWidgetSnapshot() {
        let suite = "WidgetSharingTests-" + UUID().uuidString
        let store = UserDefaults(suiteName: suite)!
        store.removePersistentDomain(forName: suite)
        store.set(Data([1]), forKey: WidgetSharing.streakSnapshotDefaultsKey)
        store.set("keep", forKey: "other")

        WidgetSharing.clearSnapshot(in: store)

        XCTAssertNil(store.data(forKey: WidgetSharing.streakSnapshotDefaultsKey))
        XCTAssertEqual(store.string(forKey: "other"), "keep")
    }

    private let utc = TimeZone(identifier: "UTC")!

    func testStudiedTodayTrueWhenLastActiveDateMatchesToday() {
        let today = localDateString(fixedNow, timeZone: utc)
        let snapshot = makeStreakWidgetSnapshot(streak: 5, longestStreak: 9, lastActiveDate: today, now: fixedNow, timeZone: utc)
        XCTAssertTrue(snapshot.studiedToday)
        XCTAssertEqual(snapshot.streak, 5)
        XCTAssertEqual(snapshot.longestStreak, 9)
    }

    func testStudiedTodayFalseWhenLastActiveDateIsAPastDay() {
        let snapshot = makeStreakWidgetSnapshot(streak: 5, longestStreak: 9, lastActiveDate: "2020-01-01", now: fixedNow, timeZone: utc)
        XCTAssertFalse(snapshot.studiedToday)
    }

    func testStudiedTodayFalseWhenNeverActive() {
        let snapshot = makeStreakWidgetSnapshot(streak: 0, longestStreak: 0, lastActiveDate: nil, now: fixedNow, timeZone: utc)
        XCTAssertFalse(snapshot.studiedToday)
    }

    /// The learner's own day, not UTC's: 23:30 UTC on the 12th is already the 13th in Sydney.
    func testStudiedTodayIsTheLearnersLocalDay() {
        let late = ISO8601DateFormatter().date(from: "2026-11-12T23:30:00Z")!
        let sydney = TimeZone(identifier: "Australia/Sydney")!
        XCTAssertEqual(localDateString(late, timeZone: sydney), "2026-11-13")
        XCTAssertEqual(localDateString(late, timeZone: utc), "2026-11-12")
        XCTAssertTrue(makeStreakWidgetSnapshot(streak: 1, longestStreak: 1, lastActiveDate: "2026-11-13", now: late, timeZone: sydney).studiedToday)
        XCTAssertFalse(makeStreakWidgetSnapshot(streak: 1, longestStreak: 1, lastActiveDate: "2026-11-13", now: late, timeZone: utc).studiedToday)
    }

    func testNextLocalMidnightIsTheStartOfTheFollowingLocalDay() {
        let sydney = TimeZone(identifier: "Australia/Sydney")!
        let late = ISO8601DateFormatter().date(from: "2026-11-12T23:30:00Z")!   // 10:30 on the 13th in Sydney
        let midnight = nextLocalMidnight(after: late, timeZone: sydney)
        XCTAssertEqual(localDateString(midnight, timeZone: sydney), "2026-11-14")
        XCTAssertEqual(localDateString(midnight.addingTimeInterval(-1), timeZone: sydney), "2026-11-13")
    }

    /// "Studied today" is only true for the UTC day the snapshot was written on. The widget used to keep
    /// showing it after midnight until the app was opened again.
    func testStudiedTodayTurnsOffWhenReadOnALaterLocalDay() {
        let written = makeStreakWidgetSnapshot(streak: 5, longestStreak: 9, lastActiveDate: localDateString(fixedNow, timeZone: utc), now: fixedNow, timeZone: utc)
        XCTAssertTrue(written.asOf(fixedNow, timeZone: utc).studiedToday)
        let midnight = nextLocalMidnight(after: fixedNow, timeZone: utc)
        XCTAssertTrue(written.asOf(midnight.addingTimeInterval(-1), timeZone: utc).studiedToday, "still the same day")
        let nextDay = written.asOf(midnight, timeZone: utc)
        XCTAssertFalse(nextDay.studiedToday)
        // Only that flag changes: the streak shown stays what the app last published.
        XCTAssertEqual(nextDay.streak, 5)
        XCTAssertEqual(nextDay.longestStreak, 9)
        XCTAssertEqual(nextDay.updatedAt, written.updatedAt)
    }

    func testANotStudiedSnapshotIsUnchangedOnALaterDay() {
        let written = makeStreakWidgetSnapshot(streak: 5, longestStreak: 9, lastActiveDate: "2020-01-01", now: fixedNow, timeZone: utc)
        XCTAssertEqual(written.asOf(fixedNow.addingTimeInterval(3 * 24 * 60 * 60), timeZone: utc), written)
    }

    func testNextLocalMidnightInUTCIsTheStartOfTheFollowingUTCDay() {
        let midnight = nextLocalMidnight(after: fixedNow, timeZone: utc)
        XCTAssertGreaterThan(midnight, fixedNow)
        XCTAssertLessThanOrEqual(midnight.timeIntervalSince(fixedNow), 24 * 60 * 60)
        XCTAssertNotEqual(localDateString(midnight, timeZone: utc), localDateString(fixedNow, timeZone: utc))
        XCTAssertEqual(localDateString(midnight.addingTimeInterval(-1), timeZone: utc), localDateString(fixedNow, timeZone: utc))
        // Exactly on a day boundary, the next one is a full day later.
        XCTAssertEqual(nextLocalMidnight(after: midnight, timeZone: utc).timeIntervalSince(midnight), 24 * 60 * 60)
    }

    /// Guards the wire format both the app and the widget extension decode
    /// -- a break here means the widget silently stops reading the app's
    /// published snapshot.
    func testEncodeDecodeRoundTrip() throws {
        let snapshot = StreakWidgetSnapshot(streak: 12, longestStreak: 40, studiedToday: true, updatedAt: fixedNow)
        let data = try JSONEncoder().encode(snapshot)
        let decoded = try JSONDecoder().decode(StreakWidgetSnapshot.self, from: data)
        XCTAssertEqual(decoded, snapshot)
    }
}
