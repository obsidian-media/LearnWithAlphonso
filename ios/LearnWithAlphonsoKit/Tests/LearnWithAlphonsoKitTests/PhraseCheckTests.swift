import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// Runs EVERY case of the shared fixture (Fixtures/phrase-check-cases.json, a byte-for-byte copy of
/// tests/fixtures/phrase-check-cases.json) through the port, plus the rules the fixture cannot express.
final class PhraseCheckTests: XCTestCase {
    private func cases() throws -> [[String: Any]] {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "phrase-check-cases", withExtension: "json", subdirectory: "Fixtures"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [[String: Any]])
    }

    func testEverySharedCaseGivesTheExpectedResultAndListenAgain() throws {
        let all = try cases()
        XCTAssertEqual(all.count, 57)
        for c in all {
            let expected = try XCTUnwrap(c["expected"] as? String)
            let heard = try XCTUnwrap(c["heard"] as? String)
            let want = try XCTUnwrap(c["want"] as? [String: Any])
            let got = PhraseChecker.check(
                expected: expected, heard: heard, words: PhraseChecker.heardWords(from: c["words"]))
            XCTAssertEqual(got.result.rawValue, want["result"] as? String, "\(expected) / \(heard)")
            XCTAssertEqual(got.listenAgain, want["listenAgain"] as? [String], "\(expected) / \(heard)")
        }
    }

    func testExactlyTheThresholdIsFineAndJustBelowIsNot() {
        let at = PhraseChecker.check(
            expected: "good morning", heard: "good morning",
            words: [HeardWord(word: "good", confidence: 0.7), HeardWord(word: "morning", confidence: 0.9)])
        XCTAssertEqual(at.result, .clear)
        let below = PhraseChecker.check(
            expected: "good morning", heard: "good morning",
            words: [HeardWord(word: "good", confidence: 0.69), HeardWord(word: "morning", confidence: 0.9)])
        XCTAssertEqual(below.result, .mostly)
        XCTAssertEqual(below.listenAgain, ["good"])
    }

    func testSilenceIsNotYet() {
        XCTAssertEqual(PhraseChecker.check(expected: "good morning", heard: "", words: nil).result, .notYet)
        XCTAssertEqual(PhraseChecker.check(expected: "", heard: "hello", words: nil).result, .notYet)
    }

    func testWordsEntriesThatAreNotFiniteNumbersAreSkipped() {
        let raw: [Any] = [
            ["word": "good", "confidence": 0.9],
            ["word": "morning", "confidence": "high"],
            ["confidence": 0.5],
            "junk",
        ]
        XCTAssertEqual(PhraseChecker.heardWords(from: raw), [HeardWord(word: "good", confidence: 0.9)])
        XCTAssertNil(PhraseChecker.heardWords(from: nil))
    }

    func testABooleanConfidenceIsNotANumber() throws {
        // Parsed from JSON the way /api/stt's body is: true and false bridge to numbers but are not numbers.
        let json = #"[{"word":"a","confidence":true},{"word":"b","confidence":false},{"word":"c","confidence":1},{"word":"d","confidence":0.5}]"#
        let raw = try JSONSerialization.jsonObject(with: Data(json.utf8))
        XCTAssertEqual(PhraseChecker.heardWords(from: raw),
                       [HeardWord(word: "c", confidence: 1), HeardWord(word: "d", confidence: 0.5)])
    }
}
