import XCTest
@testable import LearnWithAlphonsoKit

final class StreakWidgetLayoutTests: XCTestCase {
    func testOnlyTheWideWidgetWithAStreakDrawsAlphonsoAndBest() {
        let wide = StreakWidgetLayout.resolve(family: .medium, hasSnapshot: true)
        XCTAssertTrue(wide.showsAlphonso)
        XCTAssertTrue(wide.showsBest)
        XCTAssertFalse(wide.isEmpty)

        let small = StreakWidgetLayout.resolve(family: .small, hasSnapshot: true)
        XCTAssertFalse(small.showsAlphonso)
        XCTAssertFalse(small.showsBest)
        XCTAssertFalse(small.isEmpty)
    }

    func testTheEmptyStateIsTheSameAtEverySize() {
        for family in [StreakWidgetFamily.small, .medium] {
            let empty = StreakWidgetLayout.resolve(family: family, hasSnapshot: false)
            XCTAssertTrue(empty.isEmpty)
            XCTAssertFalse(empty.showsAlphonso)
            XCTAssertFalse(empty.showsBest)
        }
    }

    func testRoyalFollowsTheDevice() {
        XCTAssertEqual(StreakWidgetLook.resolve(theme: "royal", deviceDark: false), .royalLight)
        XCTAssertEqual(StreakWidgetLook.resolve(theme: "royal", deviceDark: true), .royalNight)
    }

    /// Owner decision 2026-11-14: Meadow stays light, even in dark mode.
    func testMeadowIgnoresDarkMode() {
        XCTAssertEqual(StreakWidgetLook.resolve(theme: "meadow", deviceDark: false), .meadowLight)
        XCTAssertEqual(StreakWidgetLook.resolve(theme: "meadow", deviceDark: true), .meadowLight)
    }

    func testAMissingOrRetiredThemeIsRoyal() {
        XCTAssertEqual(StreakWidgetLook.resolve(theme: nil, deviceDark: false), .royalLight)
        XCTAssertEqual(StreakWidgetLook.resolve(theme: nil, deviceDark: true), .royalNight)
        XCTAssertEqual(StreakWidgetLook.resolve(theme: "canopy", deviceDark: true), .royalNight)
    }

    func testTheLookNamesTheDesignSystemColoursItDraws() {
        XCTAssertEqual(StreakWidgetLook.royalLight.palette, .royal)
        XCTAssertFalse(StreakWidgetLook.royalLight.night)
        XCTAssertEqual(StreakWidgetLook.royalNight.palette, .royal)
        XCTAssertTrue(StreakWidgetLook.royalNight.night)
        XCTAssertEqual(StreakWidgetLook.meadowLight.palette, .meadow)
        XCTAssertFalse(StreakWidgetLook.meadowLight.night)
    }
}
