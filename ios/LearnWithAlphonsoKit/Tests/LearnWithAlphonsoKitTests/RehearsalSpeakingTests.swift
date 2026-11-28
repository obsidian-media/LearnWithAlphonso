import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// "How you spoke" on the rehearsal debrief. Decodes both cases of the shared fixture (rehearsal-api.json, key
/// "speaking") and pins the sentence and arrow rules the card relies on.
final class RehearsalSpeakingTests: XCTestCase {
    private func speakingCase(_ name: String) throws -> Data {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "rehearsal-api", withExtension: "json", subdirectory: "Fixtures"))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let cases = try XCTUnwrap(root["speaking"] as? [String: Any])
        return try JSONSerialization.data(withJSONObject: try XCTUnwrap(cases[name]))
    }

    private func body(_ notes: [[String: Any]]) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["recap": NSNull(), "rehearsalSpeaking": ["notes": notes]])
    }

    private func note(_ kind: RehearsalSpeaking.Note.Kind, _ count: Int, _ total: Int, _ previous: Int?) -> RehearsalSpeaking.Note {
        .init(kind: kind, count: count, total: total, previous: previous)
    }

    // MARK: - Decoding

    func testTheFullFixtureDecodesInTheServersOrder() throws {
        let s = try XCTUnwrap(RehearsalSpeaking.parse(try speakingCase("full")))
        XCTAssertEqual(s.notes, [
            note(.fullReplies, 7, 9, 4), note(.keyPhrases, 3, 8, 4), note(.englishFallback, 2, 9, nil),
        ])
    }

    func testTheSingleFixtureDecodes() throws {
        let s = try XCTUnwrap(RehearsalSpeaking.parse(try speakingCase("single")))
        XCTAssertEqual(s.notes, [note(.keyPhrases, 3, 8, nil)])
    }

    func testOrderIsNeverReSorted() throws {
        let s = try XCTUnwrap(RehearsalSpeaking.parse(try body([
            ["kind": "english_fallback", "count": 1, "total": 5, "previous": NSNull()],
            ["kind": "key_phrases", "count": 5, "total": 5, "previous": NSNull()],
        ])))
        XCTAssertEqual(s.notes.map(\.kind), [.englishFallback, .keyPhrases])
    }

    func testAnUnknownKindIsDroppedAndTheRestKept() throws {
        let s = try XCTUnwrap(RehearsalSpeaking.parse(try body([
            ["kind": "pace_wpm", "count": 90, "total": 100, "previous": 80],
            ["kind": "full_replies", "count": 2, "total": 4, "previous": NSNull()],
        ])))
        XCTAssertEqual(s.notes, [note(.fullReplies, 2, 4, nil)])
    }

    func testOnlyUnknownKindsMeansNoCard() throws {
        XCTAssertNil(RehearsalSpeaking.parse(try body([["kind": "pace_wpm", "count": 1, "total": 2, "previous": NSNull()]])))
    }

    func testAbsentNullEmptyOrMalformedIsNil() throws {
        XCTAssertNil(RehearsalSpeaking.parse(Data(#"{"recap":null}"#.utf8)))
        XCTAssertNil(RehearsalSpeaking.parse(Data(#"{"recap":null,"rehearsalSpeaking":null}"#.utf8)))
        XCTAssertNil(RehearsalSpeaking.parse(try body([])))
        XCTAssertNil(RehearsalSpeaking.parse(Data(#"{"rehearsalSpeaking":{"notes":"x"}}"#.utf8)))
        XCTAssertNil(RehearsalSpeaking.parse(Data("not json".utf8)))
        XCTAssertNil(RehearsalSpeaking.parse(try body([["kind": "full_replies", "count": "7", "total": 9]])))
    }

    func testANonRehearsalRecapCarriesNoSpeaking() throws {
        let data = Data(#"{"recap":{"corrections":[{"said":"a","fixed":"b","why":"c","topic":"t"}],"saved":true}}"#.utf8)
        XCTAssertNil(try XCTUnwrap(CallRecap.parse(data)).speaking)
    }

    func testASpeakingBlockNextToARecapIsKept() throws {
        let data = Data(#"""
        {"recap":{"corrections":[{"said":"a","fixed":"b","why":"c","topic":"t"}],"saved":true},
         "rehearsalSpeaking":{"notes":[{"kind":"key_phrases","count":3,"total":8,"previous":null}]}}
        """#.utf8)
        XCTAssertEqual(try XCTUnwrap(CallRecap.parse(data)).speaking?.notes, [note(.keyPhrases, 3, 8, nil)])
    }

    func testSpeakingReadsIndependentlyOfANullRecap() throws {
        let data = try speakingCase("full")
        // The recap itself is null, so CallRecap.parse says nothing while the speaking block still reads.
        XCTAssertNil(CallRecap.parse(data))
        XCTAssertNotNil(RehearsalSpeaking.parse(data))
    }

    // MARK: - Sentences

    func testFullRepliesSentences() {
        XCTAssertEqual(note(.fullReplies, 7, 9, nil).sentence(language: "French"), "You answered in full sentences 7 of 9 times")
        XCTAssertEqual(note(.fullReplies, 7, 9, 4).sentence(language: "French"), "You answered in full sentences 7 of 9 times, up from 4 last time")
        XCTAssertEqual(note(.fullReplies, 3, 9, 4).sentence(language: "French"), "You answered in full sentences 3 of 9 times, down from 4 last time")
        XCTAssertEqual(note(.fullReplies, 4, 9, 4).sentence(language: "French"), "You answered in full sentences 4 of 9 times, the same as last time")
    }

    func testEnglishFallbackSentences() {
        XCTAssertEqual(note(.englishFallback, 0, 9, 3).sentence(language: "French"), "You stayed in French the whole time.")
        XCTAssertEqual(note(.englishFallback, 0, 9, nil).sentence(language: "Spanish"), "You stayed in Spanish the whole time.")
        XCTAssertEqual(note(.englishFallback, 1, 9, nil).sentence(language: "French"), "You switched to English 1 time")
        XCTAssertEqual(note(.englishFallback, 2, 9, nil).sentence(language: "French"), "You switched to English 2 times")
        XCTAssertEqual(note(.englishFallback, 2, 9, 5).sentence(language: "French"), "You switched to English 2 times, down from 5 last time")
        XCTAssertEqual(note(.englishFallback, 5, 9, 2).sentence(language: "French"), "You switched to English 5 times, up from 2 last time")
    }

    func testKeyPhrasesSentences() {
        XCTAssertEqual(note(.keyPhrases, 3, 8, nil).sentence(language: "French"), "You used 3 of your 8 key phrases")
        XCTAssertEqual(note(.keyPhrases, 3, 8, 4).sentence(language: "French"), "You used 3 of your 8 key phrases, down from 4 last time")
        XCTAssertEqual(note(.keyPhrases, 3, 8, 3).sentence(language: "French"), "You used 3 of your 8 key phrases, the same as last time")
    }

    func testNoSentenceCarriesAScoreOrPercentage() {
        let all = [note(.fullReplies, 7, 9, 4), note(.englishFallback, 2, 9, 1), note(.keyPhrases, 3, 8, 4)]
        for n in all {
            let s = n.sentence(language: "French")
            XCTAssertFalse(s.contains("%"), s)
            XCTAssertFalse(s.lowercased().contains("score"), s)
            XCTAssertFalse(s.lowercased().contains("grade"), s)
        }
    }

    func testLanguageNames() {
        XCTAssertEqual(RehearsalSpeaking.languageName(courseCode: "en"), "English")
        XCTAssertEqual(RehearsalSpeaking.languageName(courseCode: "fr"), "French")
        XCTAssertEqual(RehearsalSpeaking.languageName(courseCode: "es"), "Spanish")
    }

    // MARK: - Arrows

    func testTrendHigherIsBetterForFullRepliesAndKeyPhrases() {
        for kind in [RehearsalSpeaking.Note.Kind.fullReplies, .keyPhrases] {
            XCTAssertEqual(note(kind, 5, 9, 4).trend, .better)
            XCTAssertEqual(note(kind, 3, 9, 4).trend, .worse)
            XCTAssertEqual(note(kind, 4, 9, 4).trend, .same)
            XCTAssertEqual(note(kind, 4, 9, nil).trend, .none)
        }
    }

    func testTrendLowerIsBetterForEnglishFallback() {
        XCTAssertEqual(note(.englishFallback, 1, 9, 4).trend, .better)
        XCTAssertEqual(note(.englishFallback, 0, 9, 4).trend, .better)
        XCTAssertEqual(note(.englishFallback, 6, 9, 4).trend, .worse)
        XCTAssertEqual(note(.englishFallback, 4, 9, 4).trend, .same)
        XCTAssertEqual(note(.englishFallback, 4, 9, nil).trend, .none)
    }

    func testArrowSymbolsExistOnlyWithAnEarlierRun() {
        XCTAssertEqual(note(.fullReplies, 5, 9, 4).arrowSymbol, "arrow.up.right")
        XCTAssertEqual(note(.fullReplies, 3, 9, 4).arrowSymbol, "arrow.down.right")
        XCTAssertEqual(note(.fullReplies, 4, 9, 4).arrowSymbol, "arrow.right")
        XCTAssertNil(note(.fullReplies, 4, 9, nil).arrowSymbol)
    }
}
