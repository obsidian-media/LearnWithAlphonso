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

    func testSpeakingReadsWithoutARecap() throws {
        let data = try speakingCase("full")
        // The recap itself is null, so CallRecap.parse says nothing while the speaking block still reads.
        XCTAssertNil(CallRecap.parse(data))
        XCTAssertNotNil(RehearsalSpeaking.parse(data))
    }

    // MARK: - Sentences

    func testFullRepliesSentences() {
        XCTAssertEqual(note(.fullReplies, 7, 9, nil).sentence(language: "French"), "You answered in full sentences 7 of 9 times.")
        XCTAssertEqual(note(.fullReplies, 7, 9, 4).sentence(language: "French"), "You answered in full sentences 7 of 9 times, up from 4 last time.")
        XCTAssertEqual(note(.fullReplies, 3, 9, 4).sentence(language: "French"), "You answered in full sentences 3 of 9 times, down from 4 last time.")
        XCTAssertEqual(note(.fullReplies, 4, 9, 4).sentence(language: "French"), "You answered in full sentences 4 of 9 times, the same as last time.")
    }

    func testEnglishFallbackSentences() {
        // The zero case carries the comparison too, exactly like the web card.
        XCTAssertEqual(note(.englishFallback, 0, 9, 3).sentence(language: "French"), "You stayed in French the whole time, down from 3 last time.")
        XCTAssertEqual(note(.englishFallback, 0, 9, 0).sentence(language: "French"), "You stayed in French the whole time, the same as last time.")
        XCTAssertEqual(note(.englishFallback, 0, 9, 2).sentence(language: "Spanish"), "You stayed in Spanish the whole time, down from 2 last time.")
        XCTAssertEqual(note(.englishFallback, 0, 9, nil).sentence(language: "Spanish"), "You stayed in Spanish the whole time.")
        XCTAssertEqual(note(.englishFallback, 1, 9, nil).sentence(language: "French"), "You switched to English once.")
        XCTAssertEqual(note(.englishFallback, 2, 9, nil).sentence(language: "French"), "You switched to English twice.")
        XCTAssertEqual(note(.englishFallback, 2, 9, 5).sentence(language: "French"), "You switched to English twice, down from 5 last time.")
        XCTAssertEqual(note(.englishFallback, 5, 9, 2).sentence(language: "French"), "You switched to English 5 times, up from 2 last time.")
    }

    func testKeyPhrasesSentences() {
        XCTAssertEqual(note(.keyPhrases, 3, 8, nil).sentence(language: "French"), "You used 3 of your 8 key phrases.")
        XCTAssertEqual(note(.keyPhrases, 3, 8, 4).sentence(language: "French"), "You used 3 of your 8 key phrases, down from 4 last time.")
        XCTAssertEqual(note(.keyPhrases, 3, 8, 3).sentence(language: "French"), "You used 3 of your 8 key phrases, the same as last time.")
        // One key phrase in the brief reads in the singular, like the web card.
        XCTAssertEqual(note(.keyPhrases, 1, 1, nil).sentence(language: "French"), "You used 1 of your 1 key phrase.")
        XCTAssertEqual(note(.keyPhrases, 0, 1, 2).sentence(language: "French"), "You used 0 of your 1 key phrase, down from 2 last time.")
    }

    func testEverySentenceIsTheWebsWordForWordAndEndsWithAFullStop() {
        // The same cases as the web card's tests (src/lib/rehearsal-speaking.test.ts).
        XCTAssertEqual(note(.fullReplies, 7, 9, 4).sentence(language: "French"), "You answered in full sentences 7 of 9 times, up from 4 last time.")
        XCTAssertEqual(note(.englishFallback, 3, 9, nil).sentence(language: "French"), "You switched to English 3 times.")
        XCTAssertEqual(note(.englishFallback, 5, 9, nil).sentence(language: "French"), "You switched to English 5 times.")
        XCTAssertEqual(note(.keyPhrases, 4, 8, 4).sentence(language: "French"), "You used 4 of your 8 key phrases, the same as last time.")
        let every: [RehearsalSpeaking.Note.Kind] = [.fullReplies, .englishFallback, .keyPhrases, .pauses]
        for kind in every {
            for (count, previous) in [(0, nil), (0, 2), (1, 1), (4, 2), (2, 4)] as [(Int, Int?)] {
                for course in ["en", "fr", "es"] {
                    let s = note(kind, count, 7, previous).sentence(language: RehearsalSpeaking.languageName(courseCode: course), courseCode: course)
                    XCTAssertTrue(s.hasSuffix("."), s)
                }
            }
        }
    }

    // MARK: - The pause note (slice B2)

    private func pausesCase() throws -> Data {
        // An inline copy of the server's B2 fixture case ("speaking.pauses" in rehearsal-api.json on the pause-note
        // server branch); the shared fixture itself arrives with that server change.
        let url = try XCTUnwrap(Bundle.module.url(forResource: "rehearsal-pauses-case", withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    func testThePausesCaseDecodesAndThePauseNoteIsNotTheLead() throws {
        let s = try XCTUnwrap(RehearsalSpeaking.parse(try pausesCase()))
        XCTAssertEqual(s.notes, [note(.fullReplies, 7, 9, 4), note(.pauses, 4, 7, nil)])
        XCTAssertEqual(s.notes.last?.kind, .pauses)
    }

    func testThePauseSentenceNamesTheCountAndTheCoursesOwnFiller() {
        let n = note(.pauses, 4, 7, nil)
        XCTAssertEqual(n.sentence(language: "English", courseCode: "en"),
                       "You took a moment before 4 of 7 answers. That's fine; next time try starting with \u{201C}Let me think\u{2026}\u{201D}.")
        XCTAssertEqual(n.sentence(language: "French", courseCode: "fr"),
                       "You took a moment before 4 of 7 answers. That's fine; next time try starting with \u{201C}Laissez-moi r\u{00E9}fl\u{00E9}chir\u{2026}\u{201D}.")
        XCTAssertEqual(n.sentence(language: "Spanish", courseCode: "es"),
                       "You took a moment before 4 of 7 answers. That's fine; next time try starting with \u{201C}D\u{00E9}jeme pensar\u{2026}\u{201D}.")
        XCTAssertEqual(n.sentence(language: "German", courseCode: "de"), n.sentence(language: "English", courseCode: "en"),
                       "an unknown course gets the English filler")
    }

    func testAPauseNeverGetsAnArrowEvenWithAnEarlierCount() {
        let withPrevious = note(.pauses, 5, 7, 2)
        XCTAssertEqual(withPrevious.trend, .none)
        XCTAssertNil(withPrevious.arrowSymbol)
        XCTAssertFalse(withPrevious.sentence(language: "English").contains("last time"))
        XCTAssertEqual(note(.pauses, 1, 7, 6).trend, .none)
    }

    func testAnUnknownKindBesideAPausesNoteIsStillDropped() throws {
        let s = try XCTUnwrap(RehearsalSpeaking.parse(try body([
            ["kind": "pace", "count": 1, "total": 2, "previous": NSNull()],
            ["kind": "pauses", "count": 3, "total": 5, "previous": NSNull()],
        ])))
        XCTAssertEqual(s.notes, [note(.pauses, 3, 5, nil)])
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
