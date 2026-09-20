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
        XCTAssertEqual(store.achievements.count, 18)
        let first = try XCTUnwrap(store.achievements.first { $0.id == "streak_3" })
        XCTAssertEqual(first.title, "Warming up")
        XCTAssertEqual(first.tier, "bronze")
        XCTAssertEqual(first.category, "streak")
        XCTAssertEqual(first.threshold, 3)
    }
}
