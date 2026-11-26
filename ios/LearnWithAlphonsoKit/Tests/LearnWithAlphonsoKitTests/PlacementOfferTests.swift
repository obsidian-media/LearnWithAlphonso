import XCTest
@testable import LearnWithAlphonsoKit

final class PlacementOfferTests: XCTestCase {
    private func style(_ level: String?, taken: Bool = false, dismissed: Bool = false, _ surface: PlacementOffer.Surface) -> PlacementOffer.Style {
        PlacementOffer.style(level: level, placementTaken: taken, dismissed: dismissed, surface: surface)
    }

    func testKnowsSomeOrConfidentIsOfferedProminentlyOnBothSurfaces() {
        for level in ["some", "confident"] {
            XCTAssertEqual(style(level, .hectorEnd), .prominent, level)
            XCTAssertEqual(style(level, .learn), .prominent, level)
        }
    }

    func testTrueBeginnersAreNotPushedButKeepTheSmallLearnCard() {
        XCTAssertEqual(style("new", .hectorEnd), .none)
        XCTAssertEqual(style("new", .learn), .quiet)
        XCTAssertEqual(style(nil, .hectorEnd), .none)
        XCTAssertEqual(style(nil, .learn), .quiet)
    }

    func testNotNowHidesTheHectorPromptAndQuietensTheLearnCard() {
        XCTAssertEqual(style("some", dismissed: true, .hectorEnd), .none)
        XCTAssertEqual(style("some", dismissed: true, .learn), .quiet)
    }

    func testTakingPlacementEndsEveryOffer() {
        for level in ["new", "some", "confident", nil] as [String?] {
            for dismissed in [false, true] {
                XCTAssertEqual(style(level, taken: true, dismissed: dismissed, .hectorEnd), .none)
                XCTAssertEqual(style(level, taken: true, dismissed: dismissed, .learn), .none)
            }
        }
    }

    func testDismissalIsKeptPerCourse() {
        XCTAssertNotEqual(PlacementOffer.dismissKey(course: "fr"), PlacementOffer.dismissKey(course: "es"))
    }
}
