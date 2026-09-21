import XCTest
@testable import LearnWithAlphonsoKit

final class WidgetSharingTests: XCTestCase {
    private let fixedNow = Date(timeIntervalSince1970: 1_700_000_000) // 2023-11-14T22:13:20Z

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
