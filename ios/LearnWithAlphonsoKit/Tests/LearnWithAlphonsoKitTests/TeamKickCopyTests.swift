import XCTest
@testable import LearnWithAlphonsoKit

final class TeamKickCopyTests: XCTestCase {
    func testTheDialogNamesThePersonBeingRemoved() {
        XCTAssertEqual(TeamKickCopy.title(memberName: "Ana"), "Remove Ana from the team?")
        XCTAssertEqual(TeamKickCopy.buttonLabel(memberName: "Ana"), "Remove Ana from the team")
    }

    func testTheConsequenceIsStatedAndTheVerbIsRemove() {
        XCTAssertEqual(TeamKickCopy.confirm, "Remove")
        XCTAssertEqual(TeamKickCopy.message, "They leave the team right away and lose access to its missions.")
    }

    func testNoCopyContainsADoubleDash() {
        for s in [TeamKickCopy.title(memberName: "A"), TeamKickCopy.message, TeamKickCopy.confirm, TeamKickCopy.buttonLabel(memberName: "A")] {
            XCTAssertFalse(s.contains("--"), s)
        }
    }
}
