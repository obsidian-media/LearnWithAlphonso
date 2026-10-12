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

    func testStudiedTodayTrueWhenLastActiveDateMatchesToday() {
        let today = utcDateString(fixedNow)
        let snapshot = makeStreakWidgetSnapshot(streak: 5, longestStreak: 9, lastActiveDate: today, now: fixedNow)
        XCTAssertTrue(snapshot.studiedToday)
        XCTAssertEqual(snapshot.streak, 5)
        XCTAssertEqual(snapshot.longestStreak, 9)
    }

    func testStudiedTodayFalseWhenLastActiveDateIsAPastDay() {
        let snapshot = makeStreakWidgetSnapshot(streak: 5, longestStreak: 9, lastActiveDate: "2020-01-01", now: fixedNow)
        XCTAssertFalse(snapshot.studiedToday)
    }

    func testStudiedTodayFalseWhenNeverActive() {
        let snapshot = makeStreakWidgetSnapshot(streak: 0, longestStreak: 0, lastActiveDate: nil, now: fixedNow)
        XCTAssertFalse(snapshot.studiedToday)
    }

    /// "Studied today" is only true for the UTC day the snapshot was written on. The widget used to keep
    /// showing it after midnight until the app was opened again.
    func testStudiedTodayTurnsOffWhenReadOnALaterUTCDay() {
        let written = makeStreakWidgetSnapshot(streak: 5, longestStreak: 9, lastActiveDate: utcDateString(fixedNow), now: fixedNow)
        XCTAssertTrue(written.asOf(fixedNow).studiedToday)
        let midnight = nextUTCMidnight(after: fixedNow)
        XCTAssertTrue(written.asOf(midnight.addingTimeInterval(-1)).studiedToday, "still the same UTC day")
        let nextDay = written.asOf(midnight)
        XCTAssertFalse(nextDay.studiedToday)
        // Only that flag changes: the streak shown stays what the app last published.
        XCTAssertEqual(nextDay.streak, 5)
        XCTAssertEqual(nextDay.longestStreak, 9)
        XCTAssertEqual(nextDay.updatedAt, written.updatedAt)
    }

    func testANotStudiedSnapshotIsUnchangedOnALaterDay() {
        let written = makeStreakWidgetSnapshot(streak: 5, longestStreak: 9, lastActiveDate: "2020-01-01", now: fixedNow)
        XCTAssertEqual(written.asOf(fixedNow.addingTimeInterval(3 * 24 * 60 * 60)), written)
    }

    func testNextUTCMidnightIsTheStartOfTheFollowingUTCDay() {
        let midnight = nextUTCMidnight(after: fixedNow)
        XCTAssertGreaterThan(midnight, fixedNow)
        XCTAssertLessThanOrEqual(midnight.timeIntervalSince(fixedNow), 24 * 60 * 60)
        XCTAssertNotEqual(utcDateString(midnight), utcDateString(fixedNow))
        XCTAssertEqual(utcDateString(midnight.addingTimeInterval(-1)), utcDateString(fixedNow))
        // Exactly on a day boundary, the next one is a full day later.
        XCTAssertEqual(nextUTCMidnight(after: midnight).timeIntervalSince(midnight), 24 * 60 * 60)
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
