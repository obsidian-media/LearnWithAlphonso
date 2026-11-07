import XCTest
@testable import LearnWithAlphonsoKit

final class ProfileTabsTests: XCTestCase {
    func testEverySectionLandsOnExactlyOneTab() {
        let placed = ProfileTab.allCases.flatMap { ProfileTabs.tabSections[$0] ?? [] }
        for s in ProfileTabs.allSections {
            XCTAssertEqual(placed.filter { $0 == s }.count, 1, "\(s) must be on exactly one tab")
        }
        XCTAssertEqual(placed.count, ProfileTabs.allSections.count)
        XCTAssertEqual(Set(ProfileSectionID.allCases), Set(ProfileTabs.allSections))
    }

    func testMatchesTheApprovedMock() {
        XCTAssertEqual(ProfileTab.allCases.map(\.label), ["Overview", "Progress", "Social"])
        XCTAssertEqual(Array(ProfileTabs.tabSections[.overview]!.prefix(3)), [.bigNumbers, .thisWeek, .hector])
        XCTAssertEqual(ProfileTabs.tabSections[.progress]?.first, .skills)
        XCTAssertEqual(ProfileTabs.tabSections[.social], [.league, .friends, .share])
    }

    func testSettingsStayOnOverview() {
        XCTAssertTrue(ProfileTabs.tabSections[.overview]!.contains(.settings))
    }

    func testStepTabClamps() {
        XCTAssertEqual(ProfileTabs.stepTab(.overview, delta: 1), .progress)
        XCTAssertEqual(ProfileTabs.stepTab(.social, delta: 1), .social)
        XCTAssertEqual(ProfileTabs.stepTab(.overview, delta: -1), .overview)
    }

    func testSummaries() {
        XCTAssertEqual(ProfileTabs.heatSummary(activeDays: 1), "1 active day")
        XCTAssertEqual(ProfileTabs.heatSummary(activeDays: 71), "71 active days")
        XCTAssertEqual(ProfileTabs.heatSummary(activeDays: 1234), "1,234 active days")
        XCTAssertEqual(ProfileTabs.recordsSummary(bestStreak: 12), "Best streak 12")
        XCTAssertEqual(ProfileTabs.weakSummary(total: 0), "Nothing to review")
        XCTAssertEqual(ProfileTabs.weakSummary(total: 3), "3 to review")
        XCTAssertEqual(ProfileTabs.achievementsSummary(unlocked: 14, total: 48), "14 of 48")
    }
}
