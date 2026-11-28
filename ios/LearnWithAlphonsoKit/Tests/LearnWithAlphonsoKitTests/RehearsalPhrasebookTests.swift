import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// The phrasebook's rules: which rows, whether the plan's entry shows, which voice, what the hint says, and what is kept
/// on the device. Meanings are tested with inline JSON because the shared fixture carries none.
final class RehearsalPhrasebookTests: XCTestCase {
    private func progress(warmup: String) throws -> RehearsalProgress {
        let json = #"{"warmup":"\#(warmup)","conversation":"todo","hard_moments":"todo"}"#
        return try JSONDecoder().decode(RehearsalProgress.self, from: Data(json.utf8))
    }

    private func brief(_ json: String) throws -> RehearsalBrief {
        try JSONDecoder().decode(RehearsalBrief.self, from: Data(json.utf8))
    }

    private func rehearsal(brief: String, id: String = "r1", course: String = "en") throws -> Rehearsal {
        let json = """
        {"id":"\(id)","course":"\(course)","eventKind":"interview","eventDate":null,"counterpart":"a manager",
         "worries":null,"brief":\(brief),"status":"active","free":true,"createdAt":"2026-11-28T00:00:00Z","closedAt":null}
        """
        return try JSONDecoder().decode(Rehearsal.self, from: Data(json.utf8))
    }

    // MARK: - Decoding

    func testTheSharedFixtureBriefDecodesItsPhrases() throws {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "rehearsal-api", withExtension: "json", subdirectory: "Fixtures"))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let state = try XCTUnwrap(RehearsalDecoding.state(from: JSONSerialization.data(withJSONObject: try XCTUnwrap(object["state"]))))
        let phrases = try XCTUnwrap(state.active?.brief?.keyPhrases)
        XCTAssertEqual(phrases.first, "I have experience in")
        XCTAssertEqual(phrases.count, 6)
        XCTAssertNil(state.active?.brief?.keyPhraseMeanings)
    }

    func testMeaningsDecodeAndABriefWithoutPhrasesIsEmptyNotAnError() throws {
        let b = try brief(#"{"setting":"s","keyPhrases":["Hello","Thanks"],"keyPhraseMeanings":["Greeting","Gratitude"]}"#)
        XCTAssertEqual(b.keyPhraseMeanings, ["Greeting", "Gratitude"])
        let bare = try brief(#"{"setting":"s"}"#)
        XCTAssertEqual(bare.keyPhrases, [])
        XCTAssertNil(bare.keyPhraseMeanings)
        let wrong = try brief(#"{"keyPhrases":"nope","keyPhraseMeanings":5}"#)
        XCTAssertEqual(wrong.keyPhrases, [])
        XCTAssertNil(wrong.keyPhraseMeanings)
    }

    // MARK: - Rows and meaning alignment

    func testMeaningsLineUpByIndex() {
        let rows = RehearsalPhrasebook.rows(keyPhrases: ["Hello", "Thanks"], meanings: ["Greeting", "Gratitude"])
        XCTAssertEqual(rows, [RehearsalPhraseRow(text: "Hello", meaning: "Greeting"), RehearsalPhraseRow(text: "Thanks", meaning: "Gratitude")])
    }

    func testAMisalignedMeaningListIsIgnoredWholeSoNoPhraseGetsAnotherPhrasesMeaning() {
        for meanings in [["Greeting"], ["Greeting", "Gratitude", "Extra"], ["Greeting", "  "]] {
            let rows = RehearsalPhrasebook.rows(keyPhrases: ["Hello", "Thanks"], meanings: meanings)
            XCTAssertEqual(rows.map(\.meaning), [nil, nil], "\(meanings)")
            XCTAssertEqual(rows.map(\.text), ["Hello", "Thanks"])
        }
        XCTAssertEqual(RehearsalPhrasebook.rows(keyPhrases: ["Hello"], meanings: nil).map(\.meaning), [nil])
    }

    func testBlankPhrasesAreDroppedWithoutShiftingMeanings() {
        let rows = RehearsalPhrasebook.rows(keyPhrases: ["Hello", "  ", "Thanks"], meanings: ["Greeting", "x", "Gratitude"])
        XCTAssertEqual(rows, [RehearsalPhraseRow(text: "Hello", meaning: "Greeting"), RehearsalPhraseRow(text: "Thanks", meaning: "Gratitude")])
    }

    // MARK: - Gating

    func testTheEntryShowsOnlyAfterTheWarmupAndWithPhrases() throws {
        let rows = [RehearsalPhraseRow(text: "Hello", meaning: nil)]
        XCTAssertTrue(RehearsalPhrasebook.isOffered(progress: try progress(warmup: "done"), rows: rows))
        XCTAssertFalse(RehearsalPhrasebook.isOffered(progress: try progress(warmup: "todo"), rows: rows))
        XCTAssertFalse(RehearsalPhrasebook.isOffered(progress: nil, rows: rows))
        XCTAssertFalse(RehearsalPhrasebook.isOffered(progress: try progress(warmup: "done"), rows: []))
    }

    // MARK: - Words and voice

    func testWords() {
        XCTAssertEqual(RehearsalPhrasebook.entryTitle, "Your phrases")
        XCTAssertEqual(RehearsalPhrasebook.entrySubtitle(count: 6), "6 phrases \u{00B7} tap to hear")
        XCTAssertEqual(RehearsalPhrasebook.title(kind: .interview), "Your phrases for this job interview")
        XCTAssertEqual(RehearsalPhrasebook.title(kind: nil), "Your phrases for this something else")
        XCTAssertEqual(RehearsalPhrasebook.hearLabel("Hello"), "Hear Hello")
    }

    func testTheHintNeverClaimsTheDeviceVoiceIsAlphonso() {
        XCTAssertEqual(RehearsalPhrasebook.hint(deviceVoice: true), "Tap play to hear it.")
        XCTAssertFalse(RehearsalPhrasebook.hint(deviceVoice: true).contains("Alphonso"))
        XCTAssertTrue(RehearsalPhrasebook.hint(deviceVoice: false).contains("Alphonso"))
    }

    func testTheVoiceFallsBackToTheDeviceWhenAnythingIsMissing() {
        XCTAssertEqual(RehearsalPhrasebook.voice(hasAIConsent: true, isOnline: true, modelFailed: false), .model)
        XCTAssertEqual(RehearsalPhrasebook.voice(hasAIConsent: false, isOnline: true, modelFailed: false), .device)
        XCTAssertEqual(RehearsalPhrasebook.voice(hasAIConsent: true, isOnline: false, modelFailed: false), .device)
        XCTAssertEqual(RehearsalPhrasebook.voice(hasAIConsent: true, isOnline: true, modelFailed: true), .device)
    }

    func testTheAudioCacheKeepsAClipPerPhraseAndIgnoresEmptyAudio() {
        let cache = RehearsalPhraseAudioCache()
        XCTAssertNil(cache.clip(for: "Hello"))
        cache.store(Data([1, 2]), for: "Hello")
        cache.store(Data(), for: "Thanks")
        XCTAssertEqual(cache.clip(for: "Hello"), Data([1, 2]))
        XCTAssertNil(cache.clip(for: "Thanks"))
        XCTAssertNil(cache.clip(for: "hello"))
    }

    // MARK: - Kept on the device

    private func defaults() -> UserDefaults {
        let suite = "RehearsalPhrasebookTests.\(UUID().uuidString)"
        let d = UserDefaults(suiteName: suite)!
        d.removePersistentDomain(forName: suite)
        return d
    }

    func testThePhrasesAreKeptForTheOfflinePhrasebook() throws {
        let store = RehearsalPhraseStore(defaults: defaults())
        let r = try rehearsal(brief: #"{"keyPhrases":["Hello","Thanks"],"keyPhraseMeanings":["Greeting","Gratitude"]}"#)
        store.save(active: r)
        let snapshot = try XCTUnwrap(store.load(course: "en"))
        XCTAssertEqual(snapshot.rehearsalId, "r1")
        XCTAssertEqual(snapshot.kind, .interview)
        XCTAssertEqual(snapshot.rows.map(\.text), ["Hello", "Thanks"])
        XCTAssertEqual(snapshot.rows.map(\.meaning), ["Greeting", "Gratitude"])
        XCTAssertNil(store.load(course: "fr"), "another course never reads this one's phrases")
    }

    func testANewRehearsalOrNoRehearsalReplacesTheKeptPhrases() throws {
        let store = RehearsalPhraseStore(defaults: defaults())
        store.save(active: try rehearsal(brief: #"{"keyPhrases":["Hello"]}"#, id: "a"))
        store.save(active: try rehearsal(brief: #"{"keyPhrases":["Bye"]}"#, id: "b"))
        XCTAssertEqual(store.load(course: "en")?.rehearsalId, "b")
        store.save(active: nil)
        XCTAssertNil(store.load(course: "en"))
        store.save(active: try rehearsal(brief: #"{"keyPhrases":["Hello"]}"#))
        store.save(active: try rehearsal(brief: #"{"setting":"no phrases"}"#))
        XCTAssertNil(store.load(course: "en"))
    }

    func testSignOutClearsTheKeptPhrases() throws {
        XCTAssertTrue(AccountCacheKeys.all.contains(RehearsalPhraseStore.key))
    }
}
