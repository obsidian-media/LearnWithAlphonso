import XCTest
@testable import LearnWithAlphonsoKit

/// The palette preference (visual round 6): Royal or Meadow, Royal by default. A user who never picked one keeps
/// the look closest to their old theme: Meadow stays Meadow, the other three themes become Royal.
final class DSPaletteTests: XCTestCase {
    func testThereAreTwoPalettesAndRoyalIsTheDefault() {
        XCTAssertEqual(DSPaletteID.allCases.map(\.rawValue), ["royal", "meadow"])
        XCTAssertEqual(DSPaletteID.defaultPalette, .royal)
    }

    func testEachRetiredThemeMapsToAPalette() {
        XCTAssertEqual(DSPaletteID.forTheme("meadow"), .meadow)
        XCTAssertEqual(DSPaletteID.forTheme("canopy"), .royal)
        XCTAssertEqual(DSPaletteID.forTheme("studio-ink"), .royal)
        XCTAssertEqual(DSPaletteID.forTheme("manuscript"), .royal)
        XCTAssertEqual(DSPaletteID.forTheme(nil), .royal)
        XCTAssertEqual(DSPaletteID.forTheme("something-else"), .royal)
    }

    func testAStoredPaletteWinsOverTheTheme() {
        XCTAssertEqual(DSPaletteID.resolve(stored: "royal", theme: "meadow"), .royal)
        XCTAssertEqual(DSPaletteID.resolve(stored: "meadow", theme: "canopy"), .meadow)
    }

    func testWithNoValidStoredPaletteTheThemeDecides() {
        XCTAssertEqual(DSPaletteID.resolve(stored: nil, theme: "meadow"), .meadow)
        XCTAssertEqual(DSPaletteID.resolve(stored: "bogus", theme: "meadow"), .meadow)
        XCTAssertEqual(DSPaletteID.resolve(stored: nil, theme: nil), .royal)
    }
}
