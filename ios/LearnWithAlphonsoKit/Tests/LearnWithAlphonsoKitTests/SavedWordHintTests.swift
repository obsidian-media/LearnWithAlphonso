import XCTest
@testable import LearnWithAlphonsoKit

/// Words in a lesson explanation are styled as plain text (the link tint is the
/// text colour), so without a hint a learner cannot discover they are tappable.
/// Showing "Tap a word to save it." under EVERY explanation would be noise across
/// a ten-question lesson, so it is shown only the first few times.
final class SavedWordHintTests: XCTestCase {
    func testTheHintShowsOnTheFirstExplanations() {
        XCTAssertTrue(SavedWordHint.shouldShow(timesShown: 0))
        XCTAssertTrue(SavedWordHint.shouldShow(timesShown: 1))
        XCTAssertTrue(SavedWordHint.shouldShow(timesShown: SavedWordHint.maxShows - 1))
    }

    func testTheHintStopsOnceItHasBeenShownEnoughTimes() {
        XCTAssertFalse(SavedWordHint.shouldShow(timesShown: SavedWordHint.maxShows))
        XCTAssertFalse(SavedWordHint.shouldShow(timesShown: SavedWordHint.maxShows + 10))
    }

    func testItIsShownAFewTimesNotJustOnce() {
        // Once is too easy to miss; a dozen is nagging.
        XCTAssertGreaterThanOrEqual(SavedWordHint.maxShows, 2)
        XCTAssertLessThanOrEqual(SavedWordHint.maxShows, 5)
    }

    func testACorruptNegativeCountStillShowsTheHint() {
        XCTAssertTrue(SavedWordHint.shouldShow(timesShown: -1))
    }
}
