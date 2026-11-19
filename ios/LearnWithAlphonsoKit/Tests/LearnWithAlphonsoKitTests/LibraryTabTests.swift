import XCTest
@testable import LearnWithAlphonsoKit

final class LibraryTabTests: XCTestCase {
    func testTabsAreAllListenWatchStoriesInThatOrder() {
        XCTAssertEqual(LibraryTab.allCases.map(\.title), ["All", "Listen", "Watch", "Stories"])
    }

    func testSeeAllLabelsNameWhatTheyOpen() {
        XCTAssertEqual(LibraryTab.watch.seeAllLabel, "See all videos")
        XCTAssertEqual(LibraryTab.stories.seeAllLabel, "See all stories")
    }

    func testContinueLabelAndSubtitleSayEpisodeNOfM() {
        XCTAssertEqual(
            LibraryTab.continueLabel(series: "Why We're Tired", number: 3, count: 6, title: "Sleep debt", detail: "4:10 left"),
            "Continue Why We're Tired, episode 3 of 6: Sleep debt, 4:10 left")
        XCTAssertEqual(LibraryTab.continueSubtitle(number: 3, count: 6, detail: "4:10 left"), "Episode 3 of 6 \u{00B7} 4:10 left")
    }
}
