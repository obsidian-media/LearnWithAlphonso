import XCTest
@testable import LearnWithAlphonsoKit

final class Icon3DCatalogTests: XCTestCase {
    func testKnownEmojiResolvesToNamespacedAsset() {
        XCTAssertEqual(Icon3DCatalog.assetName(for: "\u{2615}"), "Icon3D/hot_beverage")
    }

    func testVariationSelectorFormResolvesTheSame() {
        XCTAssertEqual(Icon3DCatalog.assetName(for: "\u{2B50}\u{FE0F}"), Icon3DCatalog.assetName(for: "\u{2B50}"))
        XCTAssertNotNil(Icon3DCatalog.assetName(for: "\u{2699}\u{FE0F}"))
    }

    func testUnknownEmojiIsNil() {
        XCTAssertNil(Icon3DCatalog.assetName(for: "\u{1F984}\u{1F984}"))
        XCTAssertNil(Icon3DCatalog.assetName(for: ""))
    }

    func testEveryMappedEmojiResolves() {
        XCTAssertGreaterThan(Icon3DCatalog.mapping.count, 20)
        for emoji in Icon3DCatalog.mapping.keys {
            XCTAssertNotNil(Icon3DCatalog.assetName(for: emoji), emoji)
        }
    }

    func testAchievementGlyphsMapToIcons() {
        XCTAssertEqual(Icon3DCatalog.emoji(forAchievementGlyph: "flame"), "\u{1F525}")
        XCTAssertNil(Icon3DCatalog.emoji(forAchievementGlyph: "no-such-glyph"))
        for glyph in ["flame", "bolt", "star", "check", "shield", "snow"] {
            let emoji = Icon3DCatalog.emoji(forAchievementGlyph: glyph)
            XCTAssertNotNil(emoji.flatMap(Icon3DCatalog.assetName(for:)), glyph)
        }
    }
}
