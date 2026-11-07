import XCTest
@testable import LearnWithAlphonsoKit

final class LearnFoldTests: XCTestCase {
    private func mk(_ n: Int) -> [FoldUnit] {
        (1...n).map { FoldUnit(id: "u\($0)", eyebrow: "Unit \($0)", title: "T\($0)", lessonIDs: ["u\($0)l1", "u\($0)l2"]) }
    }
    private func all(_ us: Int...) -> Set<String> { Set(us.flatMap { ["u\($0)l1", "u\($0)l2"] }) }
    private func kinds(_ rows: [FoldRow]) -> [String] {
        rows.map {
            switch $0 {
            case .doneRun: return "done-run"
            case .unit(_, _, let state, _, _): return "unit:\(state.rawValue)"
            }
        }
    }

    func testFoldsDoneRunOpensCurrentFoldsRest() {
        let rows = LearnFold.foldLearn(mk(6), completed: all(1, 2, 3))
        XCTAssertEqual(kinds(rows), ["done-run", "unit:current", "unit:ahead", "unit:ahead"])
        guard case .doneRun(_, let ids, let first, let last, let done, let total) = rows[0] else { return XCTFail() }
        XCTAssertEqual(ids, ["u1", "u2", "u3"])
        XCTAssertEqual(LearnFold.runLabel(first: first, last: last), "Units 1-3")
        XCTAssertEqual([done, total], [6, 6])
    }

    func testPartlyDoneUnitIsCurrentNeverFolded() {
        let rows = LearnFold.foldLearn(mk(3), completed: ["u1l1", "u1l2", "u2l1"])
        XCTAssertEqual(rows[1], .unit(key: "u2", unitID: "u2", state: .current, done: 1, total: 2))
    }

    func testFreshLearnerHasNoRunAndOneCurrent() {
        let rows = LearnFold.foldLearn(mk(4), completed: [])
        XCTAssertEqual(kinds(rows).filter { $0 == "done-run" }.count, 0)
        XCTAssertEqual(kinds(rows).filter { $0 == "unit:current" }.count, 1)
    }

    func testEverythingDoneIsOneRowNoCurrent() {
        let rows = LearnFold.foldLearn(mk(3), completed: all(1, 2, 3))
        XCTAssertEqual(kinds(rows), ["done-run"])
    }

    func testEmptyUnitIsNeverDone() {
        let rows = LearnFold.foldLearn([FoldUnit(id: "x", eyebrow: "Unit 1", title: "x", lessonIDs: [])], completed: [])
        XCTAssertEqual(kinds(rows), ["unit:current"])
    }

    func testSingleDoneUnitLabelsAsItsName() {
        guard case .doneRun(_, _, let f, let l, _, _) = LearnFold.foldLearn(mk(2), completed: all(1))[0] else { return XCTFail() }
        XCTAssertEqual(LearnFold.runLabel(first: f, last: l), "Unit 1")
    }

    func testDoneRunsBrokenByAnUnfinishedUnitStaySeparate() {
        // u1 done, u2 open, u3 done: the later done unit does NOT merge back into the first run.
        let rows = LearnFold.foldLearn(mk(3), completed: all(1, 3))
        XCTAssertEqual(kinds(rows), ["done-run", "unit:current", "done-run"])
    }

    func testCurrentUnitOf() {
        XCTAssertEqual(LearnFold.currentUnitOf(mk(5), completed: all(1, 2)),
                       LearnFold.CurrentUnit(index: 3, count: 5, unitID: "u3", lessonID: "u3l1"))
        XCTAssertNil(LearnFold.currentUnitOf(mk(2), completed: all(1, 2)))
    }

    func testRoomArtWrapsForAnyIndex() {
        XCTAssertEqual(LearnFold.roomArtFor(0), LearnFold.roomArt[0])
        XCTAssertEqual(LearnFold.roomArtFor(LearnFold.roomArt.count), LearnFold.roomArt[0])
        XCTAssertEqual(LearnFold.roomArtFor(-1), LearnFold.roomArt.last)
        XCTAssertEqual(LearnFold.roomArt.count, 21)
        XCTAssertEqual(Set(LearnFold.roomArt).count, 21)
    }

    func testRoomName() {
        XCTAssertEqual(LearnFold.roomName("techshop"), "Tech Shop")
        XCTAssertEqual(LearnFold.roomName("garden"), "Garden")
    }

    func testLimitAheadKeepsCurrentAndOneNextAndCountsHidden() {
        let rows = LearnFold.foldLearn(mk(8), completed: all(1, 2))
        let r = LearnFold.limitAhead(rows, showAll: false)
        XCTAssertEqual(kinds(r.rows), ["done-run", "unit:current", "unit:ahead"])
        XCTAssertEqual(r.hidden, 4)
    }

    func testLimitAheadShowsAllWhenAskedAndHidesNothingWithOneAhead() {
        let rows = LearnFold.foldLearn(mk(8), completed: all(1, 2))
        XCTAssertEqual(LearnFold.limitAhead(rows, showAll: true).rows.count, rows.count)
        XCTAssertEqual(LearnFold.limitAhead(rows, showAll: true).hidden, 0)
        XCTAssertEqual(LearnFold.limitAhead(LearnFold.foldLearn(mk(3), completed: all(1)), showAll: false).hidden, 0)
    }
}
