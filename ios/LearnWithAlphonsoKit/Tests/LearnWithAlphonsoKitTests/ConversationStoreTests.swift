import XCTest
@testable import LearnWithAlphonsoKit

final class ConversationStoreTests: XCTestCase {
    /// Switching course mid-conversation starts a
    /// fresh conversation in the new language, never a mix.
    func testSwitchingCourseStartsAFreshConversationInTheNewLanguage() {
        let store = ConversationStore()
        let english = ConversationKey.scenario("coffee", course: .english)
        _ = store.snapshot(for: english, seededWith: "Hi! What can I get you?")
        store.append(ChatMessage(role: "user", content: "A latte please"), to: english)

        let french = ConversationKey.scenario("coffee", course: .french)
        XCTAssertNil(store.snapshot(for: french))
        let fresh = store.snapshot(for: french, seededWith: "Bonjour ! Qu'est-ce que je vous sers ?")
        XCTAssertEqual(fresh.turns, [ChatMessage(role: "assistant", content: "Bonjour ! Qu'est-ce que je vous sers ?")])
        XCTAssertFalse(fresh.turns.contains { $0.content == "A latte please" })
        // The English conversation is untouched for when the learner switches back.
        XCTAssertEqual(store.snapshot(for: english)?.turns.count, 2)
    }

    func testHectorAndCampaignKeysAreDistinctPerCourseAndFromScenarios() {
        XCTAssertNotEqual(ConversationKey.hector(course: .english), .hector(course: .spanish))
        XCTAssertNotEqual(ConversationKey.campaign("city-day", course: .french), .scenario("city-day", course: .french))
        XCTAssertEqual(ConversationKey.campaign("city-day", course: .french).scenarioId, "campaign:city-day")
        XCTAssertEqual(ConversationKey.hector(course: .french).scenarioId, "hector")
    }

    /// A tab switch re-runs onAppear; it must not wipe the conversation (the
    /// old `.task { turns = [opener] }` did).
    func testSeedingDoesNotOverwriteAnExistingConversation() {
        let store = ConversationStore()
        let key = ConversationKey.scenario("coffee", course: .english)
        _ = store.snapshot(for: key, seededWith: "Hi!")
        store.append(ChatMessage(role: "user", content: "Latte"), to: key)
        XCTAssertEqual(store.snapshot(for: key, seededWith: "Hi!").turns.count, 2)
    }

    func testHectorSeedsEmpty() {
        let store = ConversationStore()
        XCTAssertEqual(store.snapshot(for: .hector(course: .spanish), seededWith: nil).turns, [])
    }

    func testAppendRecordsConfidenceAgainstTheTurnIndex() {
        let store = ConversationStore()
        let key = ConversationKey.scenario("coffee", course: .spanish)
        _ = store.snapshot(for: key, seededWith: "¡Hola!")
        let snapshot = store.append(ChatMessage(role: "user", content: "Un café"), confidence: 0.91, to: key)
        XCTAssertEqual(snapshot.confidenceByTurnIndex, [1: 0.91])
    }

    func testUpdateMutatesCampaignState() {
        let store = ConversationStore()
        let key = ConversationKey.campaign("city-day", course: .french)
        _ = store.snapshot(for: key, seededWith: "Bonjour !")
        let after = store.update(key) {
            $0.turns.append(ChatMessage(role: "assistant", content: "Scène 2"))
            $0.sceneAnchor = $0.turns.count - 1
            $0.sceneIndex += 1
        }
        XCTAssertEqual(after.sceneIndex, 1)
        XCTAssertEqual(after.sceneAnchor, 1)
        XCTAssertEqual(store.snapshot(for: key), after)
    }

    func testResetAndRemoveAll() {
        let store = ConversationStore()
        let a = ConversationKey.scenario("coffee", course: .english)
        let b = ConversationKey.hector(course: .french)
        _ = store.snapshot(for: a, seededWith: "Hi")
        _ = store.snapshot(for: b, seededWith: nil)
        store.reset(a)
        XCTAssertNil(store.snapshot(for: a))
        XCTAssertNotNil(store.snapshot(for: b))
        store.removeAll()
        XCTAssertNil(store.snapshot(for: b))
    }
}
