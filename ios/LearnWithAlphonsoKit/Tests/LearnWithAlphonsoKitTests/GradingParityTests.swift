import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// The iPhone leg of the shared answer-grading fixture set. The web (src/lib/grading-parity.test.ts), the Deno
/// edge copy, this file and the Android core all read tests/fixtures/grading-parity.json. Fixtures/grading-parity.json
/// here is a byte-for-byte copy (a copy, not a symlink: the Kit has to build on Windows too), and
/// `testTheCopyMatchesTheSource` fails when they differ. `runtimes` says where a case applies; every runtime it
/// applies to must produce `expected`.
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
        let variants: [Variant]?
    }

    /// A goal-flavoured version of the case's question; the input is right when it is right for the case OR for any.
    private struct Variant: Decodable {
        let choices: [String]?
        let answerIndex: Int?
        let answer: String?
        let bank: [String]?
        let acceptable: [String]?

        var goalVariant: GoalVariant {
            GoalVariant(
                prompt: "v", choices: choices, answerIndex: answerIndex, answerText: answer, bank: bank,
                acceptableAnswers: acceptable, explanation: "e")
        }
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

    private func goalVariants(_ c: Case) -> [String: GoalVariant]? {
        guard let variants = c.variants else { return nil }
        var out: [String: GoalVariant] = [:]
        for (i, v) in variants.enumerated() { out["g\(i)"] = v.goalVariant }
        return out
    }

    private func question(_ c: Case) throws -> Question {
        let gv = goalVariants(c)
        switch c.kind {
        case "mc":
            return .multipleChoice(Question.MultipleChoice(
                id: "q", prompt: "p", choices: try XCTUnwrap(c.choices), answer: try XCTUnwrap(c.answerIndex),
                explanation: "e", goalVariants: gv))
        case "fill":
            return .fillInBlank(Question.FillInBlank(
                id: "q", prompt: "p", bank: [try XCTUnwrap(c.answer)], answer: try XCTUnwrap(c.answer),
                explanation: "e", goalVariants: gv))
        case "reorder":
            return .reorder(Question.Reorder(
                id: "q", prompt: "p", tokens: [], answer: try XCTUnwrap(c.answer), explanation: "e"))
        case "listening":
            return .listening(Question.Listening(
                id: "q", prompt: "p", audioText: "a", choices: [], answer: try XCTUnwrap(c.answer), explanation: "e",
                goalVariants: gv))
        case "speak":
            return .speak(Question.Speak(
                id: "q", prompt: "p", answer: try XCTUnwrap(c.answer), explanation: "e", goalVariants: gv))
        case "translate":
            return .translate(Question.Translate(
                id: "q", prompt: "p", acceptableAnswers: try XCTUnwrap(c.acceptable), explanation: "e",
                goalVariants: gv))
        default:
            throw XCTSkip("unknown kind \(c.kind)")
        }
    }

    func testEveryApplicableCaseGradesAsTheFixtureSays() throws {
        let fixture = try loadFixture()
        let ids = fixture.cases.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count, "case ids must be unique")
        let applicable = fixture.cases.filter { ($0.runtimes ?? ["web", "deno", "ios", "android"]).contains(Self.runtime) }
        let excluded = fixture.cases.filter { $0.runtimes != nil && !$0.runtimes!.contains(Self.runtime) }
        XCTAssertEqual(applicable.count, fixture.cases.count - excluded.count)
        XCTAssertGreaterThan(applicable.count, 0)
        var ran = 0
        for c in applicable {
            let got = isAnswerCorrect(try question(c), picked: c.input, course: course(c))
            XCTAssertEqual(got, c.expected, c.id)
            ran += 1
        }
        XCTAssertEqual(ran, applicable.count)
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
