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

    // Meadow stays light, even in dark mode (owner decision 2026-11-14). Royal keeps its night look.
    func testMeadowNeverUsesNightWhateverTheDeviceSays() {
        XCTAssertFalse(DSPaletteID.meadow.usesNight(deviceDark: true))
        XCTAssertFalse(DSPaletteID.meadow.usesNight(deviceDark: false))
    }

    func testRoyalFollowsTheDevice() {
        XCTAssertTrue(DSPaletteID.royal.usesNight(deviceDark: true))
        XCTAssertFalse(DSPaletteID.royal.usesNight(deviceDark: false))
    }

    /// The forced scheme: the root applies this as `.preferredColorScheme`, so a dark device cannot darken Meadow's
    /// sheets, alerts, keyboards or status bar.
    func testMeadowForcesTheLightAppearanceOnADarkDevice() {
        XCTAssertEqual(DSPaletteID.meadow.appearance(deviceDark: true), .light)
        XCTAssertEqual(DSPaletteID.meadow.appearance(deviceDark: false), .light)
    }

    func testRoyalAppearanceIsTheDevices() {
        XCTAssertEqual(DSPaletteID.royal.appearance(deviceDark: true), .dark)
        XCTAssertEqual(DSPaletteID.royal.appearance(deviceDark: false), .light)
    }
}
