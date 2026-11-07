import XCTest
@testable import LearnWithAlphonsoKit

/// Build 59: the call showed the scene's opening line but Alphonso never said it.
@MainActor
final class OpenerSpeechTests: XCTestCase {
    private struct Boom: Error {}

    // MARK: - The opener reaches the player

    func testTheOpenerIsSynthesizedAndHandedToThePlayerAtCallStart() async {
        var synthesized: [String] = []
        var played: [(Data, Int)] = []
        let started = await OpenerPlayback.speak(
            "Welcome! What can I get you?",
            begin: { 7 },
            audio: { text in synthesized.append(text); return Data("voice".utf8) },
            play: { data, generation in played.append((data, generation)); return true },
            withoutAudio: { _ in XCTFail("the voice was fetched") })
        XCTAssertTrue(started)
        XCTAssertEqual(synthesized, ["Welcome! What can I get you?"])
        XCTAssertEqual(played.count, 1)
        XCTAssertEqual(played.first?.0, Data("voice".utf8))
        XCTAssertEqual(played.first?.1, 7)
    }

    func testNoPendingOpenerFetchesNothing() async {
        var begun = false
        let started = await OpenerPlayback.speak(
            nil, begin: { begun = true; return 1 },
            audio: { _ in XCTFail("nothing to say"); return Data() },
            play: { _, _ in XCTFail("nothing to play"); return true },
            withoutAudio: { _ in XCTFail("nothing began") })
        XCTAssertFalse(started)
        XCTAssertFalse(begun)
    }

    /// A busy or hidden session: no fetch, so no voice budget is spent on a line that cannot play.
    func testABusySessionFetchesNothing() async {
        let started = await OpenerPlayback.speak(
            "Hello", begin: { nil },
            audio: { _ in XCTFail("must not fetch"); return Data() },
            play: { _, _ in XCTFail("must not play"); return true },
            withoutAudio: { _ in XCTFail("nothing began") })
        XCTAssertFalse(started)
    }

    func testAFailedFetchEndsTheOpenerWithoutAudio() async {
        var ended: [Int] = []
        let started = await OpenerPlayback.speak(
            "Hello", begin: { 3 },
            audio: { _ in throw Boom() },
            play: { _, _ in XCTFail("nothing to play"); return true },
            withoutAudio: { ended.append($0) })
        XCTAssertFalse(started)
        XCTAssertEqual(ended, [3])
    }

    /// Driven through the real reducer: the opener leaves the session speaking, so the avatar's lips move with it.
    func testWithTheRealReducerTheOpenerEndsSpeakingAndThenIdle() async {
        var state = VoiceSessionState()
        _ = state.handle(.appeared)
        await OpenerPlayback.speak(
            "Hello",
            begin: {
                guard state.canStartPress else { return nil }
                _ = state.handle(.openerRequested)
                return state.generation
            },
            audio: { _ in Data("v".utf8) },
            play: { _, generation in
                _ = state.handle(.replyReady(generation: generation, hasAudio: true))
                return true
            },
            withoutAudio: { generation in _ = state.handle(.replyReady(generation: generation, hasAudio: false)) })
        XCTAssertEqual(state.phase, .speaking(generation: state.generation))
        XCTAssertEqual(state.handle(.playbackFinished(generation: state.generation)), [.deactivateAudioSession])
        XCTAssertEqual(state.phase, .idle)
    }

    // MARK: - Cache

    func testTheSameOpenerIsFetchedOnce() async throws {
        let cache = OpenerSpeechCache()
        var fetches = 0
        for _ in 0..<3 {
            let data = try await cache.audio(text: "Hello", voice: "aura-2-a", course: "en") {
                fetches += 1
                return Data("hello".utf8)
            }
            XCTAssertEqual(data, Data("hello".utf8))
        }
        XCTAssertEqual(fetches, 1)
    }

    func testAnotherVoiceOrCourseFetchesAgain() async throws {
        let cache = OpenerSpeechCache()
        var fetches = 0
        let fetch: () async throws -> Data = { fetches += 1; return Data() }
        _ = try await cache.audio(text: "Hola", voice: "a", course: "es", synthesize: fetch)
        _ = try await cache.audio(text: "Hola", voice: "b", course: "es", synthesize: fetch)
        _ = try await cache.audio(text: "Hola", voice: "a", course: "fr", synthesize: fetch)
        XCTAssertEqual(fetches, 3)
    }

    func testAFailureIsNotCached() async throws {
        let cache = OpenerSpeechCache()
        var attempts = 0
        do {
            _ = try await cache.audio(text: "Hi", voice: nil, course: "en") { attempts += 1; throw Boom() }
            XCTFail("should throw")
        } catch {}
        let data = try await cache.audio(text: "Hi", voice: nil, course: "en") { attempts += 1; return Data("ok".utf8) }
        XCTAssertEqual(data, Data("ok".utf8))
        XCTAssertEqual(attempts, 2)
    }

    func testTheCacheIsBounded() async throws {
        let cache = OpenerSpeechCache(capacity: 2)
        for text in ["a", "b", "c"] {
            _ = try await cache.audio(text: text, voice: nil, course: nil) { Data(text.utf8) }
        }
        XCTAssertEqual(cache.count, 2)
    }

    // MARK: - Which line is pending

    func testAFreshConversationsOpenerIsPending() {
        let snapshot = ConversationSnapshot(
            turns: [ChatMessage(role: "assistant", content: "Welcome!")], openerIndices: [0])
        XCTAssertEqual(snapshot.pendingOpener, "Welcome!")
    }

    func testAnAnsweredOpenerIsNotPending() {
        let snapshot = ConversationSnapshot(
            turns: [ChatMessage(role: "assistant", content: "Welcome!"), ChatMessage(role: "user", content: "Hi")],
            openerIndices: [0])
        XCTAssertNil(snapshot.pendingOpener)
    }

    /// A model reply that repeats an opener's words is still a reply: it was spoken by the reply path already.
    func testAModelReplyIsNeverAPendingOpener() {
        let snapshot = ConversationSnapshot(
            turns: [
                ChatMessage(role: "assistant", content: "Welcome!"), ChatMessage(role: "user", content: "Hi"),
                ChatMessage(role: "assistant", content: "Welcome!"),
            ],
            openerIndices: [0])
        XCTAssertNil(snapshot.pendingOpener)
    }

    func testANewScenesOpenerIsPending() {
        var snapshot = ConversationSnapshot(
            turns: [ChatMessage(role: "assistant", content: "Scene one"), ChatMessage(role: "user", content: "Hi")],
            openerIndices: [0])
        snapshot.appendOpener("Scene two")
        XCTAssertEqual(snapshot.pendingOpener, "Scene two")
        snapshot.finished = true
        XCTAssertNil(snapshot.pendingOpener)
    }

    func testHectorHasNoOpener() {
        XCTAssertNil(ConversationSnapshot().pendingOpener)
    }
}
