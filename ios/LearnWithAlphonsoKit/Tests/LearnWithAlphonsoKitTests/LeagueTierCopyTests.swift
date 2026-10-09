import XCTest
@testable import LearnWithAlphonsoKit

final class LeagueTierCopyTests: XCTestCase {
    func testEveryLeagueKeyHasItsOnBrandName() {
        XCTAssertEqual(LEAGUES.map(LeagueTierCopy.label(for:)), ["Sprout", "Sapling", "Grove", "Treetop", "Summit"])
    }

    func testNoTierIsShownWithAGemOrMetalName() {
        let old = ["Bronze", "Silver", "Gold", "Sapphire", "Ruby", "Emerald", "Diamond", "Amethyst", "Pearl", "Obsidian"]
        for key in LEAGUES { XCTAssertFalse(old.contains(LeagueTierCopy.label(for: key)), key) }
    }

    func testDatabaseKeysAreUnchanged() {
        XCTAssertEqual(LEAGUES, ["bronze", "silver", "sapphire", "ruby", "diamond"])
    }
}
