import XCTest
@testable import LearnWithAlphonsoKit

final class UnitPathTests: XCTestCase {
    private func states(_ ids: [String], _ done: Set<String>, max: Int = 5) -> [String] {
        UnitPath.nodes(lessonIDs: ids, completed: done, max: max).map { "\($0.id):\($0.state.rawValue)" }
    }

    func testNoneDone() {
        XCTAssertEqual(states(["a", "b", "c"], []), ["a:next", "b:locked", "c:locked"])
    }

    func testOutOfOrder() {
        XCTAssertEqual(states(["a", "b", "c", "d"], ["a", "c"]), ["a:done", "b:next", "c:done", "d:locked"])
    }

    func testAllDoneShowsTheLastLessons() {
        XCTAssertEqual(states(["a", "b", "c", "d", "e", "f"], ["a", "b", "c", "d", "e", "f"], max: 3), ["d:done", "e:done", "f:done"])
    }

    func testWindow() {
        let ids = ["a", "b", "c", "d", "e", "f", "g", "h"]
        XCTAssertEqual(states(ids, ["a", "b", "c", "d"]), ["c:done", "d:done", "e:next", "f:locked", "g:locked"])
        XCTAssertEqual(states(ids, ["a", "b", "c", "d", "e", "f", "g"]).map { String($0.prefix(1)) }, ["d", "e", "f", "g", "h"])
    }

    func testEmptyUnit() {
        XCTAssertEqual(UnitPath.nodes(lessonIDs: [], completed: []), [])
    }
}
