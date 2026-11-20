import XCTest
@testable import LearnWithAlphonsoKit

final class ClipTempFilesTests: XCTestCase {
    func testSweepRemovesOnlyTheLeftoverClipFiles() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sweep-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let mine = [ClipTempFiles.name(fileExtension: "m4a"), ClipTempFiles.name(fileExtension: "mp3")]
        let others = ["turn.m4a", "keep-sir-wave-x.mp3"]
        for n in mine + others { try Data([1]).write(to: dir.appendingPathComponent(n)) }

        XCTAssertEqual(ClipTempFiles.sweep(in: dir), 2)

        let left = Set(try FileManager.default.contentsOfDirectory(atPath: dir.path))
        XCTAssertEqual(left, Set(others))
    }

    func testSweepOfAMissingDirectoryIsZero() {
        XCTAssertEqual(ClipTempFiles.sweep(in: URL(fileURLWithPath: "/no/such/dir-\(UUID().uuidString)")), 0)
    }

    func testNamesCarryThePrefixAndExtension() {
        let n = ClipTempFiles.name(fileExtension: "m4a")
        XCTAssertTrue(n.hasPrefix("sir-wave-"))
        XCTAssertTrue(n.hasSuffix(".m4a"))
    }
}
