import XCTest
@testable import LearnWithAlphonsoKit

/// Replays shared/hector-chips.json, which the TypeScript and Kotlin ports replay too.
final class HectorChipsTests: XCTestCase {
    private func load() throws -> [[String: Any]] {
        // .../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/HectorChipsTests.swift -> repo root
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        url.appendPathComponent("shared/hector-chips.json")
        let data = try Data(contentsOf: url)
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try XCTUnwrap(root["cases"] as? [[String: Any]])
    }

    private func course(_ code: String) -> Course {
        switch code {
        case "fr": return .french
        case "es": return .spanish
        default: return .english
        }
    }

    func testChipsMatchTheSharedFixtures() throws {
        let cases = try load()
        XCTAssertGreaterThanOrEqual(cases.count, 9)
        for c in cases {
            let name = c["name"] as! String
            let input = c["input"] as! [String: Any]
            let got = HectorChips.build(
                course: course(input["course"] as! String),
                weakSpot: input["weakSpot"] as? String,
                streakDays: input["streakDays"] as! Int)
            let expected = c["chips"] as! [[String: Any]]
            XCTAssertEqual(got.map(\.id), expected.map { $0["id"] as! String }, name)
            XCTAssertEqual(got.map(\.label), expected.map { $0["label"] as! String }, name)
            XCTAssertEqual(got.map(\.message), expected.map { $0["message"] as! String }, name)
            XCTAssertLessThanOrEqual(got.count, 4, name)
        }
    }
}
