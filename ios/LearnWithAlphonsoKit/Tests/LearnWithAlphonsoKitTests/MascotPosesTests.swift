import XCTest
@testable import LearnWithAlphonsoKit

final class MascotPosesTests: XCTestCase {
    func testLessonCompleteIsAlphonsoProud() {
        let art = MascotPoseCatalog.art(for: .lessonComplete, available: ["alphonso-proud"])
        XCTAssertEqual(art.mascot, "alphonso")
        XCTAssertEqual(art.assetName, "Alphonso-proud")
    }

    func testMissingPoseFallsBackToTheBaseImage() {
        XCTAssertEqual(MascotPoseCatalog.art(for: .lessonComplete, available: []).assetName, "Alphonso")
        XCTAssertEqual(MascotPoseCatalog.art(for: .hectorListening, available: ["alphonso-proud"]).assetName, "Hector")
    }

    func testEveryMomentIsInTheSharedFile() {
        for moment in MascotMoment.allCases {
            let art = MascotPoseCatalog.art(for: moment, available: [])
            XCTAssertTrue(["Alphonso", "Hector"].contains(art.assetName), moment.rawValue)
        }
        XCTAssertEqual(Set(MascotMoment.allCases.map(\.rawValue)), Set(MascotPoseCatalog.moments.keys))
    }
}
