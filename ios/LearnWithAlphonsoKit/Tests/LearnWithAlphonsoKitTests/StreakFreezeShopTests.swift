import XCTest
@testable import LearnWithAlphonsoKit

final class StreakFreezeShopTests: XCTestCase {
    private let base = LessonCompletionProgress(
        xp: 200, streak: 4, longestStreak: 9, lastActiveDate: "2026-11-03", hearts: 3,
        heartsRefillAt: 1_000, streakFreezes: 1, leagueTier: "silver"
    )

    func testCostMatchesTheServerAndWeb() {
        XCTAssertEqual(StreakFreezeShop.xpCost, 75)
        XCTAssertEqual(StreakFreezeShop.buyTitle, "Buy a freeze (75 XP)")
    }

    func testOwnedTextPluralises() {
        XCTAssertEqual(StreakFreezeShop.ownedText(0), "0 streak freezes")
        XCTAssertEqual(StreakFreezeShop.ownedText(1), "1 streak freeze")
        XCTAssertEqual(StreakFreezeShop.ownedText(2), "2 streak freezes")
    }

    func testDisabledReasonOrdersBusyThenOfflineThenXp() {
        XCTAssertNil(StreakFreezeShop.disabledReason(isOnline: true, xp: 75, buying: false))
        XCTAssertNotNil(StreakFreezeShop.disabledReason(isOnline: true, xp: 200, buying: true))
        XCTAssertEqual(StreakFreezeShop.disabledReason(isOnline: false, xp: 500, buying: false), "Go online to buy a streak freeze.")
        XCTAssertEqual(StreakFreezeShop.disabledReason(isOnline: true, xp: 74, buying: false), "You need 75 XP for a streak freeze. You have 74.")
        XCTAssertEqual(StreakFreezeShop.disabledReason(isOnline: false, xp: 0, buying: false), "Go online to buy a streak freeze.")
    }

    func testMessages() {
        XCTAssertEqual(StreakFreezeShop.message(for: .ok(streakFreezes: 2, xp: 125)), "Streak freeze bought. You have 2.")
        XCTAssertEqual(StreakFreezeShop.message(for: .insufficientXp(streakFreezes: 1)), "Not enough XP. A streak freeze costs 75 XP.")
        XCTAssertTrue(StreakFreezeShop.isSuccess(.ok(streakFreezes: 2, xp: 125)))
        XCTAssertFalse(StreakFreezeShop.isSuccess(.insufficientXp(streakFreezes: nil)))
    }

    func testProgressChangesOnlyAfterTheServerConfirms() {
        let bought = StreakFreezeShop.progress(after: .ok(streakFreezes: 2, xp: 125), from: base)
        XCTAssertEqual(bought.streakFreezes, 2)
        XCTAssertEqual(bought.xp, 125)
        XCTAssertEqual(bought.streak, 4)
        XCTAssertEqual(bought.hearts, 3)
        XCTAssertEqual(bought.leagueTier, "silver")
        XCTAssertEqual(StreakFreezeShop.progress(after: .insufficientXp(streakFreezes: 1), from: base), base)
    }

    func testAccessibilityLabelNamesCountAndXp() {
        XCTAssertEqual(
            StreakFreezeShop.accessibilityLabel(freezes: 1, xp: 200),
            "1 streak freeze. 200 XP. A freeze keeps your streak if you miss a day."
        )
    }
}
