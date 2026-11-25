import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// The iPhone leg of the shared answer-grading fixture set. The web (src/lib/grading-parity.test.ts), the Deno
/// edge copy, this file and the Android core all read tests/fixtures/grading-parity.json. Fixtures/grading-parity.json
/// here is a byte-for-byte copy (a copy, not a symlink: the Kit has to build on Windows too), and
/// `testTheCopyMatchesTheSource` fails when they differ. `runtimes` says where a case applies; `divergent` records
/// what this runtime does TODAY where it disagrees with `expected` -- it is asserted, so a fix turns the case red
/// until the marker is removed.
final class GradingParityTests: XCTestCase {
    private struct Case: Decodable {
        let id: String
        let kind: String
        let course: String?
        let input: String?
        let answer: String?
        let choices: [String]?
        let answerIndex: Int?
        let acceptable: [String]?
        let expected: Bool
        let runtimes: [String]?
        let divergent: [String: Bool]?
    }

    private struct Fixture: Decodable {
        let cases: [Case]
    }

    private static let runtime = "ios"

    private func loadFixture() throws -> Fixture {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "grading-parity", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    private func course(_ c: Case) -> Course {
        switch c.course ?? "en" {
        case "fr": return .french
        case "es": return .spanish
        default: return .english
        }
    }

    private func question(_ c: Case) throws -> Question {
        switch c.kind {
        case "mc":
            return .multipleChoice(Question.MultipleChoice(
                id: "q", prompt: "p", choices: try XCTUnwrap(c.choices), answer: try XCTUnwrap(c.answerIndex),
                explanation: "e"))
        case "fill":
            return .fillInBlank(Question.FillInBlank(
                id: "q", prompt: "p", bank: [], answer: try XCTUnwrap(c.answer), explanation: "e"))
        case "reorder":
            return .reorder(Question.Reorder(
                id: "q", prompt: "p", tokens: [], answer: try XCTUnwrap(c.answer), explanation: "e"))
        case "listening":
            return .listening(Question.Listening(
                id: "q", prompt: "p", audioText: "a", choices: [], answer: try XCTUnwrap(c.answer), explanation: "e"))
        case "speak":
            return .speak(Question.Speak(id: "q", prompt: "p", answer: try XCTUnwrap(c.answer), explanation: "e"))
        case "translate":
            return .translate(Question.Translate(
                id: "q", prompt: "p", acceptableAnswers: try XCTUnwrap(c.acceptable), explanation: "e"))
        default:
            throw XCTSkip("unknown kind \(c.kind)")
        }
    }

    func testEveryApplicableCaseGradesAsTheFixtureSays() throws {
        let fixture = try loadFixture()
        let ids = fixture.cases.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count, "case ids must be unique")
        let applicable = fixture.cases.filter { ($0.runtimes ?? ["web", "deno", "ios", "android"]).contains(Self.runtime) }
        XCTAssertGreaterThan(applicable.count, 150)
        for c in applicable {
            let got = isAnswerCorrect(try question(c), picked: c.input, course: course(c))
            XCTAssertEqual(got, c.divergent?[Self.runtime] ?? c.expected, c.id)
        }
    }

    func testTheCopyMatchesTheSource() throws {
        // #filePath is .../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/GradingParityTests.swift
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { root.deleteLastPathComponent() }
        let source = root.appendingPathComponent("tests/fixtures/grading-parity.json")
        let copy = try XCTUnwrap(
            Bundle.module.url(forResource: "grading-parity", withExtension: "json", subdirectory: "Fixtures"))
        XCTAssertEqual(
            try Data(contentsOf: copy), try Data(contentsOf: source),
            "ios/.../Fixtures/grading-parity.json must be a byte-for-byte copy of tests/fixtures/grading-parity.json")
    }
}
