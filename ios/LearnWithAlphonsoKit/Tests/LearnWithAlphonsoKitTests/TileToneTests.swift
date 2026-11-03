import XCTest
@testable import LearnWithAlphonsoKit

final class TileToneTests: XCTestCase {
    /// Same vectors as src/lib/tile-tones.test.ts, so a scenario gets the same colour on web and iPhone.
    func testCycles() {
        XCTAssertEqual(TileTone.all, ["coral", "sky", "sun", "lilac", "mint"])
        XCTAssertEqual(TileTone.forIndex(0), "coral")
        XCTAssertEqual(TileTone.forIndex(4), "mint")
        XCTAssertEqual(TileTone.forIndex(5), "coral")
        XCTAssertEqual(TileTone.forIndex(7), "sun")
        XCTAssertEqual(TileTone.forIndex(-1), "coral")
    }
}
