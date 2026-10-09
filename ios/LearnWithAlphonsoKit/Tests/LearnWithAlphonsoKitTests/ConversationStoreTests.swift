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

    func testOpenersAreTrackedByPositionNotByWords() {
        let store = ConversationStore()
        let key = ConversationKey.campaign("city-day", course: .english)
        _ = store.snapshot(for: key, seededWith: "Welcome!")
        // The model repeats the opener's exact words: still a model reply.
        let after = store.update(key) {
            $0.turns.append(ChatMessage(role: "user", content: "Hi"))
            $0.turns.append(ChatMessage(role: "assistant", content: "Welcome!"))
            $0.appendOpener("Scene 2")
        }
        XCTAssertEqual(after.openerIndices, [0, 3])
        XCTAssertFalse(after.openerIndices.contains(2))
    }

    /// A report records the scene a reply was made in. Continue adds an opener; Restart cuts back to the scene's
    /// opener; Finish leaves the last scene's replies in the last scene.
    func testEachTurnKnowsItsOwnSceneThroughContinueRestartAndFinish() {
        func reply(_ text: String) -> ChatMessage { ChatMessage(role: "assistant", content: text) }
        var snapshot = ConversationSnapshot(turns: [reply("S1")], openerIndices: [0])
        snapshot.turns.append(ChatMessage(role: "user", content: "a"))
        snapshot.turns.append(reply("r1"))                       // 2: scene 0
        snapshot.appendOpener("S2")                              // 3: Continue
        snapshot.sceneAnchor = 3
        snapshot.sceneIndex = 1
        snapshot.turns.append(ChatMessage(role: "user", content: "b"))
        snapshot.turns.append(reply("r2"))                       // 5: scene 1
        XCTAssertEqual((0..<snapshot.turns.count).map(snapshot.sceneIndex(ofTurnAt:)), [0, 0, 0, 1, 1, 1])

        // Restart scene 2: back to its opener; the earlier scene's replies keep their own scene.
        snapshot.restartScene()
        XCTAssertEqual((0..<snapshot.turns.count).map(snapshot.sceneIndex(ofTurnAt:)), [0, 0, 0, 1])
        snapshot.turns.append(reply("r2 again"))                 // 4: scene 1 again
        XCTAssertEqual(snapshot.sceneIndex(ofTurnAt: 4), 1)

        // Continue to a third scene, then Finish: the last scene's replies stay in the last scene.
        snapshot.appendOpener("S3")                              // 5
        snapshot.sceneAnchor = 5
        snapshot.sceneIndex = 2
        snapshot.turns.append(reply("r3"))                       // 6
        snapshot.finished = true
        XCTAssertEqual(snapshot.sceneIndex(ofTurnAt: 6), 2)
        XCTAssertEqual(snapshot.sceneIndex(ofTurnAt: 2), 0, "an earlier reply is not reassigned by finishing")
        XCTAssertEqual(snapshot.sceneIndex(ofTurnAt: 4), 1)
    }

    func testATurnWithNoOpenerBeforeItIsSceneZero() {
        XCTAssertEqual(ConversationSnapshot(turns: [], openerIndices: []).sceneIndex(ofTurnAt: 0), 0)
    }

    func testRestartingASceneKeepsOnlyItsOpenerAndEarlierOnes() {
        var snapshot = ConversationSnapshot(turns: [ChatMessage(role: "assistant", content: "S1")], openerIndices: [0])
        snapshot.turns.append(ChatMessage(role: "user", content: "a"))
        snapshot.appendOpener("S2")
        snapshot.sceneAnchor = 2
        snapshot.turns.append(ChatMessage(role: "user", content: "b"))
        snapshot.confidenceByTurnIndex[3] = 0.9
        snapshot.restartScene()
        XCTAssertEqual(snapshot.turns.map(\.content), ["S1", "a", "S2"])
        XCTAssertEqual(snapshot.openerIndices, [0, 2])
        XCTAssertTrue(snapshot.confidenceByTurnIndex.isEmpty)
    }

    func testOnlyTheLatestTurnsAreSentToTheModel() {
        var snapshot = ConversationSnapshot()
        for index in 0..<100 { snapshot.turns.append(ChatMessage(role: "user", content: "turn \(index)")) }
        XCTAssertEqual(snapshot.recentTurns.count, ConversationSnapshot.maxTurnsSent)
        XCTAssertEqual(snapshot.recentTurns.first?.content, "turn 60")
        XCTAssertEqual(snapshot.recentTurns.last?.content, "turn 99")
        XCTAssertEqual(ConversationSnapshot(turns: [ChatMessage(role: "user", content: "x")]).recentTurns.count, 1)
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

    /// "New conversation" clears only this (scenario, course) and re-opens it with the opener.
    func testStartNewResetsOnlyThatKeyAndReseedsWithTheOpener() {
        let store = ConversationStore()
        let coffee = ConversationKey.scenario("coffee", course: .english)
        let hotel = ConversationKey.scenario("hotel", course: .english)
        _ = store.snapshot(for: coffee, seededWith: "Hi!")
        store.append(ChatMessage(role: "user", content: "A latte"), confidence: 0.9, to: coffee)
        _ = store.snapshot(for: hotel, seededWith: "Welcome")
        let fresh = store.startNew(coffee, opener: "Hi!")
        XCTAssertEqual(fresh.turns, [ChatMessage(role: "assistant", content: "Hi!")])
        XCTAssertEqual(fresh.confidenceByTurnIndex, [:])
        XCTAssertEqual(fresh.openerIndices, [0])
        XCTAssertEqual(store.snapshot(for: hotel)?.turns.count, 1)
    }
}
