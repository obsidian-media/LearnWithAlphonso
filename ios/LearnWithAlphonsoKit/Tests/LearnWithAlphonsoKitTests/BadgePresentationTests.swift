import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

final class BadgePresentationTests: XCTestCase {
    private typealias B = BadgePresentation

    private func ach(_ id: String, _ category: String, _ threshold: Int, tier: String = "bronze") -> Achievement {
        try! JSONDecoder().decode(Achievement.self, from: Data(
            #"{"id":"\#(id)","title":"T","description":"D","icon":"star","tier":"\#(tier)","category":"\#(category)","threshold":\#(threshold)}"#.utf8))
    }

    private var catalog: [Achievement] {
        [ach("streak_3", "streak", 3), ach("streak_7", "streak", 7, tier: "silver"), ach("streak_30", "streak", 30, tier: "gold"),
         ach("xp_100", "xp", 100), ach("xp_500", "xp", 500, tier: "silver"),
         ach("team_player", "team", 1, tier: "silver")]
    }

    // MARK: Ring

    func testTheRingFillsInProportionAndNeverLeavesZeroToOne() {
        XCTAssertEqual(B.fraction(value: 12, threshold: 30), 0.4, accuracy: 0.0001)
        XCTAssertEqual(B.fraction(value: 40, threshold: 30), 1, accuracy: 0.0001)
        XCTAssertEqual(B.fraction(value: -5, threshold: 30), 0, accuracy: 0.0001)
        XCTAssertEqual(B.fraction(value: 5, threshold: 0), 0, accuracy: 0.0001)
    }

    func testThePercentRoundsDownSoNoBadgeReadsDoneBeforeItIs() {
        XCTAssertEqual(B.percent(value: 12, threshold: 30), 40)
        XCTAssertEqual(B.percent(value: 29, threshold: 30), 96)
        XCTAssertEqual(B.percent(value: 30, threshold: 30), 100)
    }

    // MARK: States

    func testAnEarnedBadgeIsEarnedAndTheNextOneInItsFamilyShowsProgress() {
        let s = B.states(catalog: catalog, unlocked: ["streak_3"], stats: ["streak": 5, "xp": 0])
        XCTAssertEqual(s["streak_3"], .earned)
        XCTAssertEqual(s["streak_7"], .progress(value: 5, threshold: 7))
        XCTAssertEqual(s["streak_30"], .locked)
    }

    func testOnlyTheLowestUnmetBadgeOfAFamilyHasARing() {
        let s = B.states(catalog: catalog, unlocked: [], stats: ["streak": 2])
        XCTAssertEqual(s["streak_3"], .progress(value: 2, threshold: 3))
        XCTAssertEqual(s["streak_7"], .locked)
        XCTAssertEqual(s["streak_30"], .locked)
    }

    func testAFamilyTheLearnerHasNotStartedOnStaysLocked() {
        let s = B.states(catalog: catalog, unlocked: [], stats: ["streak": 0, "xp": 0])
        XCTAssertEqual(s["streak_3"], .locked)
        XCTAssertEqual(s["xp_100"], .locked)
        XCTAssertEqual(s["xp_500"], .locked)
    }

    func testTheTeamBadgeNeverShowsARing() {
        let s = B.states(catalog: catalog, unlocked: [], stats: ["team": 1, "streak": 1])
        XCTAssertEqual(s["team_player"], .locked)
        XCTAssertEqual(B.states(catalog: catalog, unlocked: ["team_player"], stats: [:])["team_player"], .earned)
    }

    func testTheRingFractionComesFromTheState() {
        XCTAssertEqual(BadgeState.progress(value: 12, threshold: 30).fraction ?? -1, 0.4, accuracy: 0.0001)
        XCTAssertNil(BadgeState.earned.fraction)
        XCTAssertNil(BadgeState.locked.fraction)
    }

    // MARK: Words

    func testTheProgressLineUsesThousandsSeparatorsAndNeverPassesTheThreshold() {
        XCTAssertEqual(B.progressLine(value: 12, threshold: 30), "12 of 30")
        XCTAssertEqual(B.progressLine(value: 1240, threshold: 2000), "1,240 of 2,000")
        XCTAssertEqual(B.progressLine(value: 25000, threshold: 10000), "10,000 of 10,000")
    }

    func testTheTierChipNamesTheWingedRungsDiamondPrime() {
        XCTAssertEqual(B.tierLabel(id: "streak_100", tier: "diamond"), "Diamond")
        XCTAssertEqual(B.tierLabel(id: "streak_365", tier: "diamond"), "Diamond prime")
        XCTAssertEqual(B.tierLabel(id: "xp_25000", tier: "diamond"), "Diamond prime")
        XCTAssertEqual(B.tierLabel(id: "streak_7", tier: "silver"), "Silver")
    }

    func testTheArtNameIsThePrefixedId() {
        XCTAssertEqual(B.artName(id: "streak_30"), "Badge-streak_30")
    }

    func testTheLadderIsTheFamilyFromTheLowestRungUp() {
        let ids = B.ladder(for: catalog[1], in: catalog.shuffled()).map(\.id)
        XCTAssertEqual(ids, ["streak_3", "streak_7", "streak_30"])
        XCTAssertEqual(B.ladder(for: catalog[5], in: catalog).map(\.id), ["team_player"])
    }

    func testTheFamilyNamesAndTheCountLine() {
        XCTAssertEqual(B.familyName("freeze"), "Streak freeze")
        XCTAssertEqual(B.familyName("perfect"), "Perfect lessons")
        XCTAssertEqual(B.familyName("xp"), "XP")
        XCTAssertEqual(B.unlockedLine(unlocked: 7, total: 25), "7 of 25 unlocked")
    }

    func testTheUnlockDayReadsAsMonthDayYearWithOrWithoutFractionalSeconds() {
        let utc = TimeZone(identifier: "UTC")!
        XCTAssertEqual(B.unlockedDate("2026-11-09T10:00:00+00:00", timeZone: utc), "Nov 9, 2026")
        XCTAssertEqual(B.unlockedDate("2026-11-09T10:00:00.123456+00:00", timeZone: utc), "Nov 9, 2026")
        XCTAssertEqual(B.unlockedDate("2026-11-09T23:30:00Z", timeZone: utc), "Nov 9, 2026")
        XCTAssertNil(B.unlockedDate("not a date", timeZone: utc))
        XCTAssertNil(B.unlockedDate("", timeZone: utc))
    }

    func testNoBadgeIsEarnedOrRingedWhenTheUnlockStatusCouldNotBeRead() {
        let s = B.states(catalog: catalog, unlocked: ["streak_3"], stats: ["streak": 3, "xp": 40], unlockStatusKnown: false)
        XCTAssertEqual(Set(s.values), [.locked])
        XCTAssertEqual(s.count, catalog.count)
    }

    // MARK: The real catalog

    private func realCatalog() throws -> [Achievement] {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<3 { url.deleteLastPathComponent() }
        url.appendPathComponent("Sources/LearnWithAlphonsoKit/Resources/achievements.json")
        return try JSONDecoder().decode([Achievement].self, from: Data(contentsOf: url))
    }

    func testEveryRealAchievementResolvesToArtAndAKnownFamilyAndTier() throws {
        let real = try realCatalog()
        XCTAssertEqual(real.count, 25)
        let families: Set<String> = ["Streak", "XP", "Perfect lessons", "Lessons", "League", "Streak freeze", "Team"]
        let tiers: Set<String> = ["Bronze", "Silver", "Gold", "Diamond", "Diamond prime"]
        for a in real {
            XCTAssertEqual(B.artName(id: a.id), "Badge-\(a.id)")
            XCTAssertTrue(families.contains(B.familyName(a.category)), a.id)
            XCTAssertTrue(tiers.contains(B.tierLabel(id: a.id, tier: a.tier)), a.id)
            XCTAssertTrue(B.ladder(for: a, in: real).contains { $0.id == a.id }, a.id)
        }
        XCTAssertEqual(Set(real.filter { B.tierLabel(id: $0.id, tier: $0.tier) == "Diamond prime" }.map(\.id)), ["streak_365", "xp_25000"])
    }

    func testEveryRealFamilyLadderClimbsStrictly() throws {
        let real = try realCatalog()
        for category in Set(real.map(\.category)) {
            let rungs = real.filter { $0.category == category }
            XCTAssertEqual(Set(rungs.map(\.threshold)).count, rungs.count, category)
        }
    }

    func testOnlyAStreakBadgeGetsACelebrationLine() {
        XCTAssertEqual(B.celebrationLine(category: "streak", threshold: 30), "Your streak just hit 30 days. Keep it going tomorrow.")
        XCTAssertNil(B.celebrationLine(category: "xp", threshold: 500))
        XCTAssertNil(B.celebrationLine(category: "team", threshold: 1))
    }

    func testTheUnlockPoseIsTheFlameForStreaksAndSurprisedForTheRest() {
        XCTAssertEqual(B.unlockPose(category: "streak"), "streak-flame")
        XCTAssertEqual(B.unlockPose(category: "xp"), "surprised-impressed")
        XCTAssertEqual(B.unlockPose(category: "league"), "surprised-impressed")
    }
}
