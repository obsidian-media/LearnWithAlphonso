import XCTest
@testable import LearnWithAlphonsoKit

final class ContentStoreTests: XCTestCase {
    func testLoadsEnglishAndFrenchBundles() throws {
        let store = try ContentStore()
        // 559 = 534 + the 25 listening lessons added 2026-09-24 (V5 phase 2A).
        // This is the third place an English lesson count is hardcoded, after
        // curriculum-seed.test.ts and ios-content-export.test.ts -- adding a
        // pack is never only a content change.
        XCTAssertEqual(store.english.units.reduce(0) { $0 + $1.lessons.count }, 609)
        XCTAssertEqual(store.french.units.reduce(0) { $0 + $1.lessons.count }, 500) // V3 pkg 4a: closed the 125 -> ~500 French content gap
    }

    func testFindsLessonById() throws {
        let store = try ContentStore()
        let found = store.findLesson(id: "u1l1", course: .english)
        XCTAssertNotNil(found, "u1l1 (Saying Hello, from curriculum.ts's foundationUnits) should exist in the exported bundle")
        XCTAssertEqual(found?.lesson.title, "Saying Hello")
    }

    func testLoadsCampaigns() throws {
        // V4 candidate #4: one real campaign shipped as proof of the
        // architecture -- see docs/superpowers/specs/2026-09-21-
        // conversation-campaigns-design.md.
        let store = try ContentStore()
        XCTAssertEqual(store.campaigns.count, 1)
        let campaign = try XCTUnwrap(store.campaigns.first { $0.id == "city-day" })
        XCTAssertEqual(campaign.title, "A day in a new city")
        XCTAssertEqual(campaign.scenes.count, 3)
        XCTAssertEqual(campaign.scenes.map(\.id), ["coffee-stop", "directions", "small-talk"])
        for scene in campaign.scenes {
            XCTAssertGreaterThan(scene.minTurns, 0)
        }
    }

    func testLoadsTheAchievementsCatalog() throws {
        let store = try ContentStore()
        XCTAssertEqual(store.achievements.count, 24) // 18 original + 6 from V3 pkg 2's expanded catalog
        let first = try XCTUnwrap(store.achievements.first { $0.id == "streak_3" })
        XCTAssertEqual(first.title, "Warming up")
        XCTAssertEqual(first.tier, "bronze")
        XCTAssertEqual(first.category, "streak")
        XCTAssertEqual(first.threshold, 3)
    }

    func testLoadsVocabImages() throws {
        let store = try ContentStore()
        XCTAssertGreaterThan(store.vocabImages.count, 1000, "src/data/vocab-images.ts has ~1,900 entries")
        let children = try XCTUnwrap(store.vocabImages["children"], "vocab-images.ts's first entry should be keyed 'children'")
        XCTAssertTrue(children.url.hasPrefix("https://images.pexels.com/"))
    }
}
