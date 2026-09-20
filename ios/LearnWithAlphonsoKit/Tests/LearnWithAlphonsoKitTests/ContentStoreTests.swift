import XCTest
@testable import LearnWithAlphonsoKit

final class ContentStoreTests: XCTestCase {
    func testLoadsEnglishAndFrenchBundles() throws {
        let store = try ContentStore()
        XCTAssertEqual(store.english.units.reduce(0) { $0 + $1.lessons.count }, 534)
        XCTAssertEqual(store.french.units.reduce(0) { $0 + $1.lessons.count }, 125)
    }

    func testFindsLessonById() throws {
        let store = try ContentStore()
        let found = store.findLesson(id: "u1l1", course: .english)
        XCTAssertNotNil(found, "u1l1 (Saying Hello, from curriculum.ts's foundationUnits) should exist in the exported bundle")
        XCTAssertEqual(found?.lesson.title, "Saying Hello")
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
