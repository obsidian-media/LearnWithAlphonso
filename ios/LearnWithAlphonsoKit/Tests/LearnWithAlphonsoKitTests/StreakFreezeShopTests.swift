import XCTest
@testable import LearnWithAlphonsoKit

final class StreakFreezeShopTests: XCTestCase {
    private let base = LessonCompletionProgress(
        xp: 200, streak: 4, longestStreak: 9, lastActiveDate: "2026-11-03", hearts: 3,
        heartsRefillAt: 1_000, streakFreezes: 1, leagueTier: "silver"
    )
    private let status = StreakFreezeStatus(xp: 130, streakFreezes: 1)

    func testCostMatchesTheServerAndWeb() {
        XCTAssertEqual(StreakFreezeShop.xpCost, 75)
        XCTAssertEqual(StreakFreezeShop.buyTitle, "Buy a freeze (75 XP)")
    }

    func testOwnedTextPluralises() {
        XCTAssertEqual(StreakFreezeShop.ownedText(0), "0 streak freezes")
        XCTAssertEqual(StreakFreezeShop.ownedText(1), "1 streak freeze")
        XCTAssertEqual(StreakFreezeShop.ownedText(2), "2 streak freezes")
    }

    func testDisabledReasonOrdersBusyThenOfflineThenUnknownThenShort() {
        XCTAssertNil(StreakFreezeShop.disabledReason(isOnline: true, xp: 75, buying: false))
        XCTAssertNotNil(StreakFreezeShop.disabledReason(isOnline: true, xp: 200, buying: true))
        XCTAssertEqual(StreakFreezeShop.disabledReason(isOnline: false, xp: 500, buying: false), "Go online to buy a streak freeze.")
        XCTAssertEqual(StreakFreezeShop.disabledReason(isOnline: true, xp: nil, buying: false), "Checking your XP for this course.")
        XCTAssertEqual(
            StreakFreezeShop.disabledReason(isOnline: true, xp: 74, buying: false),
            "You need 75 XP in this course for a streak freeze. You have 74."
        )
    }

    func testMessages() {
        XCTAssertEqual(StreakFreezeShop.message(for: .ok(streakFreezes: 2, xp: 125)), "Streak freeze bought. You have 2.")
        XCTAssertEqual(StreakFreezeShop.message(for: .insufficientXp(streakFreezes: 1, xp: 10)), "Not enough XP. A streak freeze costs 75 XP.")
        XCTAssertEqual(StreakFreezeShop.message(for: .signedOut), TutorError.signedOut.userMessage())
        XCTAssertTrue(StreakFreezeShop.isSuccess(.ok(streakFreezes: 2, xp: 125)))
        XCTAssertFalse(StreakFreezeShop.isSuccess(.insufficientXp(streakFreezes: nil, xp: nil)))
        XCTAssertFalse(StreakFreezeShop.isSuccess(.signedOut))
    }

    func testStatusFollowsOnlyTheServerAnswer() {
        XCTAssertEqual(StreakFreezeShop.status(after: .ok(streakFreezes: 2, xp: 55), from: status), StreakFreezeStatus(xp: 55, streakFreezes: 2))
        // A refusal carries the real balance, so Buy disables instead of inviting another try.
        XCTAssertEqual(StreakFreezeShop.status(after: .insufficientXp(streakFreezes: 1, xp: 20), from: status), StreakFreezeStatus(xp: 20, streakFreezes: 1))
        XCTAssertEqual(StreakFreezeShop.status(after: .insufficientXp(streakFreezes: nil, xp: nil), from: status), status)
        XCTAssertEqual(StreakFreezeShop.status(after: .signedOut, from: status), status)
    }

    func testTheHeaderCacheGetsOnlyTheFreezeCountNeverAnotherCoursesXp() {
        let cached = StreakFreezeShop.cachedProgress(freezes: 2, from: base)
        XCTAssertEqual(cached.streakFreezes, 2)
        XCTAssertEqual(cached.xp, 200)
        XCTAssertEqual(cached.streak, 4)
        XCTAssertEqual(cached.hearts, 3)
        XCTAssertEqual(cached.leagueTier, "silver")
    }

    func testRecoveryAfterALostResponse() {
        XCTAssertEqual(
            StreakFreezeShop.recoveryMessage(before: 1, after: StreakFreezeStatus(xp: 55, streakFreezes: 2)),
            "Streak freeze bought. You have 2."
        )
        let unchanged = "Could not reach the server. Check your connection and try again."
        XCTAssertEqual(StreakFreezeShop.recoveryMessage(before: 1, after: StreakFreezeStatus(xp: 130, streakFreezes: 1)), unchanged)
        XCTAssertEqual(StreakFreezeShop.recoveryMessage(before: 1, after: nil), unchanged)
    }

    func testAccessibilityLabelNamesCountAndTheCoursesXp() {
        XCTAssertEqual(
            StreakFreezeShop.accessibilityLabel(freezes: 1, xp: 200),
            "1 streak freeze. 200 XP in this course. A freeze keeps your streak if you miss a day."
        )
        XCTAssertEqual(
            StreakFreezeShop.accessibilityLabel(freezes: 0, xp: nil),
            "0 streak freezes. A freeze keeps your streak if you miss a day."
        )
    }
}
