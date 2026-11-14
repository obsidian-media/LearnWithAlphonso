import XCTest
@testable import LearnWithAlphonsoKit

/// The two themes (Royal and Meadow, Royal by default). The palette is the theme: the stored value is one of the
/// two raw values. A learner whose saved theme was one of the three retired ones (Studio Ink, Manuscript, Canopy)
/// moves to Royal, silently; unknown and missing values are Royal too.
final class DSPaletteTests: XCTestCase {
    func testThereAreTwoPalettesAndRoyalIsTheDefault() {
        XCTAssertEqual(DSPaletteID.allCases.map(\.rawValue), ["royal", "meadow"])
        XCTAssertEqual(DSPaletteID.defaultPalette, .royal)
    }

    func testAValidStoredValueIsKept() {
        XCTAssertEqual(DSPaletteID.resolve(stored: "royal"), .royal)
        XCTAssertEqual(DSPaletteID.resolve(stored: "meadow"), .meadow)
    }

    func testEachRetiredThemeBecomesRoyal() {
        for retired in ["studio-ink", "manuscript", "canopy"] {
            XCTAssertEqual(DSPaletteID.resolve(stored: retired), .royal, retired)
        }
    }

    func testUnknownAndMissingValuesAreRoyal() {
        XCTAssertEqual(DSPaletteID.resolve(stored: nil), .royal)
        XCTAssertEqual(DSPaletteID.resolve(stored: ""), .royal)
        XCTAssertEqual(DSPaletteID.resolve(stored: "Meadow"), .royal)
        XCTAssertEqual(DSPaletteID.resolve(stored: "something-else"), .royal)
    }
}
