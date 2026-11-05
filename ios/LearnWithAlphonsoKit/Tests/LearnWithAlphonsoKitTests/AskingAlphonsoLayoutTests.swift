import XCTest
@testable import LearnWithAlphonsoKit

/// Mirrors src/lib/asking-alphonso.test.ts -- keep in sync with that file.
final class AskingAlphonsoLayoutTests: XCTestCase {
    private func size(_ h: Double, length: Int = 22, media: Bool = false, ax: Bool = false) -> Int? {
        AskingAlphonsoLayout.portraitSize(screenHeight: h, accessibilitySize: ax, promptLength: length, hasMedia: media)
    }

    func testStepsByScreenHeight() {
        XCTAssertNil(size(667))   // iPhone SE
        XCTAssertEqual(size(668), 56)
        XCTAssertEqual(size(800), 56)
        XCTAssertEqual(size(812), 128)  // iPhone mini gets the large figure
        XCTAssertEqual(size(844), 128)
        XCTAssertNil(size(320))
    }

    func testAccessibilityTextSizeAlwaysDropsHim() {
        XCTAssertNil(size(932, ax: true))
        XCTAssertNil(size(700, ax: true))
    }

    func testPromptOfExactly60CharactersIsNotLong() {
        XCTAssertEqual(size(844, length: 60), 128)
        XCTAssertEqual(size(844, length: 61), 56)
    }

    func testMediaCardCapsHimAtTheSmallAvatar() {
        XCTAssertEqual(size(844, media: true), 56)
    }

    func testLongPromptOnAMediaCardRemovesHim() {
        XCTAssertNil(size(844, length: 70, media: true))
        XCTAssertNil(size(700, length: 70, media: true))
    }

    func testCrowdedCardNeverMakesHimBiggerOnAShortScreen() {
        XCTAssertNil(size(600, media: true))
        XCTAssertNil(size(667, length: 70))
        XCTAssertEqual(size(700, length: 70), 56)
    }
}
