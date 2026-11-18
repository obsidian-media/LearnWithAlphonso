import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class PronunciationTests: XCTestCase {
    /// A Unit has no public initialiser (it is only ever decoded), so build one the way the app does: one lesson per
    /// entry, each lesson's questions answered by the given words.
    private func unit(_ lessons: [(id: String, answers: [String])]) throws -> LearnWithAlphonsoKit.Unit {
        let lessonJSON = lessons.map { lesson -> String in
            let questions = lesson.answers.enumerated().map {
                #"{"type":"fill","id":"\#(lesson.id)q\#($0.offset)","prompt":"I see a ___.","bank":["\#($0.element)"],"answer":"\#($0.element)","explanation":"x"}"#
            }.joined(separator: ",")
            return #"{"id":"\#(lesson.id)","title":"t","subtitle":"s","questions":[\#(questions)]}"#
        }.joined(separator: ",")
        let json = #"{"id":"u1","level":"A1","eyebrow":"e","title":"t","description":"d","lessons":[\#(lessonJSON)]}"#
        return try JSONDecoder().decode(LearnWithAlphonsoKit.Unit.self, from: Data(json.utf8))
    }

    private func words(_ n: Int) throws -> [VocabItem] {
        let u = try unit([(id: "l1", answers: (0..<n).map { "word\($0)" })])
        return Pronunciation.learnedPool(units: [u], completedLessonIDs: ["l1"], course: .english)
    }

    // MARK: verdict bands (the same two thresholds as the web)

    func testTheThresholdsAreTheWebOnes() {
        XCTAssertEqual(Pronunciation.highConfidence, 0.85)
        XCTAssertEqual(Pronunciation.lowConfidence, 0.6)
    }

    func testAMatchAtOrAboveHighIsGreatIncludingExactlyHigh() {
        XCTAssertEqual(Pronunciation.judge(transcript: "dog", confidence: 0.99, term: "dog", course: .english), .great)
        XCTAssertEqual(Pronunciation.judge(transcript: "dog", confidence: 0.85, term: "dog", course: .english), .great)
    }

    func testAMatchBetweenLowAndHighIsAlmostIncludingExactlyLow() {
        XCTAssertEqual(Pronunciation.judge(transcript: "dog", confidence: 0.8499, term: "dog", course: .english), .almost)
        XCTAssertEqual(Pronunciation.judge(transcript: "dog", confidence: 0.6, term: "dog", course: .english), .almost)
    }

    func testAMatchBelowLowIsTryAgain() {
        XCTAssertEqual(Pronunciation.judge(transcript: "dog", confidence: 0.5999, term: "dog", course: .english), .again)
    }

    func testNoMatchIsTryAgainWhateverTheConfidence() {
        XCTAssertEqual(Pronunciation.judge(transcript: "cat", confidence: 0.99, term: "dog", course: .english), .again)
        XCTAssertEqual(Pronunciation.judge(transcript: "", confidence: 0.99, term: "dog", course: .english), .again)
        XCTAssertEqual(Pronunciation.judge(transcript: "hotdog", confidence: 0.99, term: "dog", course: .english), .again)
    }

    func testAMatchWithNoConfidenceIsGreat() {
        XCTAssertEqual(Pronunciation.judge(transcript: "Dog.", confidence: nil, term: "dog", course: .english), .great)
    }

    func testMatchingIsForgivingPerCourse() {
        XCTAssertEqual(Pronunciation.judge(transcript: "a dog", confidence: 0.9, term: "dog", course: .english), .great)
        XCTAssertEqual(Pronunciation.judge(transcript: "el abogado", confidence: 0.9, term: "abogado", course: .spanish), .great)
    }

    // MARK: learned pool

    func testThePoolIsOnlyWordsFromCompletedLessons() throws {
        let u = try unit([(id: "l1", answers: ["dog", "cat"]), (id: "l2", answers: ["bird"])])
        let pool = Pronunciation.learnedPool(units: [u], completedLessonIDs: ["l1"], course: .english)
        XCTAssertEqual(pool.map(\.term), ["dog", "cat"])
    }

    func testFinishingAnotherLessonGrowsThePoolOnTheNextCall() throws {
        let u = try unit([(id: "l1", answers: ["dog"]), (id: "l2", answers: ["bird"])])
        XCTAssertEqual(Pronunciation.learnedPool(units: [u], completedLessonIDs: ["l1"], course: .english).map(\.term), ["dog"])
        XCTAssertEqual(Pronunciation.learnedPool(units: [u], completedLessonIDs: ["l1", "l2"], course: .english).map(\.term), ["dog", "bird"])
    }

    func testNothingLearnedIsAnEmptyPool() throws {
        let u = try unit([(id: "l1", answers: ["dog"])])
        XCTAssertTrue(Pronunciation.learnedPool(units: [u], completedLessonIDs: [], course: .english).isEmpty)
    }

    func testTermsDedupeIgnoringCaseAndLongPhrasesAreExcluded() throws {
        let u = try unit([(id: "l1", answers: ["Dog", "dog", "one two three four five"])])
        let pool = Pronunciation.learnedPool(units: [u], completedLessonIDs: ["l1"], course: .english)
        XCTAssertEqual(pool.map(\.term), ["Dog"])
        XCTAssertTrue(Pronunciation.usableTarget("one two three four", course: .english))
        XCTAssertFalse(Pronunciation.usableTarget("one two three four five", course: .english))
        XCTAssertFalse(Pronunciation.usableTarget("  ", course: .english))
    }

    func testDrawGivesEightDistinctWordsOfALargerPoolAndAWholeSmallOne() throws {
        let drawn = Pronunciation.draw(try words(20))
        XCTAssertEqual(drawn.count, 8)
        XCTAssertEqual(Set(drawn.map(\.term)).count, 8)
        XCTAssertEqual(Pronunciation.draw(try words(5)).count, 5)
    }

    func testStarsAreByShareAndNeverBelowOne() {
        XCTAssertEqual(Pronunciation.stars(great: 8, total: 8), 3)
        XCTAssertEqual(Pronunciation.stars(great: 6, total: 8), 3)
        XCTAssertEqual(Pronunciation.stars(great: 4, total: 8), 2)
        XCTAssertEqual(Pronunciation.stars(great: 0, total: 8), 1)
        XCTAssertEqual(Pronunciation.stars(great: 0, total: 0), 1)
    }

    // MARK: session flow (a miss teaches, never punishes)

    func testAFirstAttemptGreatEarnsTheStarAndMovesToTheResult() throws {
        var s = PronunciationSession(words: try words(8))
        XCTAssertEqual(s.submit(transcript: "word0", confidence: 0.95, course: .english), .great)
        XCTAssertEqual(s.phase, .result)
        XCTAssertEqual(s.greatFirst, 1)
        s.next()
        XCTAssertEqual(s.index, 1)
        XCTAssertEqual(s.phase, .ask)
    }

    func testAnAlmostAllowsOneRetryAndEarnsNoStar() throws {
        var s = PronunciationSession(words: try words(8))
        XCTAssertEqual(s.submit(transcript: "word0", confidence: 0.7, course: .english), .retry(.almost))
        XCTAssertEqual(s.phase, .retry)
        XCTAssertEqual(s.greatFirst, 0)
    }

    func testARetryThatIsGreatFinishesTheWordButEarnsNoStar() throws {
        var s = PronunciationSession(words: try words(8))
        s.submit(transcript: "banana", confidence: 0.99, course: .english)
        XCTAssertEqual(s.phase, .retry)
        XCTAssertEqual(s.submit(transcript: "word0", confidence: 0.99, course: .english), .finished(.great))
        XCTAssertEqual(s.phase, .result)
        XCTAssertEqual(s.verdict, .great)
        XCTAssertEqual(s.greatFirst, 0)
    }

    func testAFailedRetryStillMovesOnWithoutAnotherTry() throws {
        var s = PronunciationSession(words: try words(8))
        s.submit(transcript: "banana", confidence: 0.99, course: .english)
        XCTAssertEqual(s.submit(transcript: "apple", confidence: 0.99, course: .english), .finished(.again))
        XCTAssertEqual(s.phase, .result)
        // The word is done: a further transcript changes nothing.
        XCTAssertEqual(s.submit(transcript: "word0", confidence: 0.99, course: .english), .unheard)
        XCTAssertEqual(s.greatFirst, 0)
        s.next()
        XCTAssertEqual(s.index, 1)
        XCTAssertNil(s.verdict)
    }

    func testSilenceIsNotAMiss() throws {
        var s = PronunciationSession(words: try words(8))
        XCTAssertEqual(s.submit(transcript: "  ", confidence: nil, course: .english), .unheard)
        XCTAssertEqual(s.phase, .ask)
    }

    func testAWordCanBeSkippedFromAnyPhase() throws {
        var s = PronunciationSession(words: try words(8))
        s.next()
        XCTAssertEqual(s.index, 1)
        s.submit(transcript: "banana", confidence: 0.9, course: .english)
        XCTAssertEqual(s.phase, .retry)
        s.next()
        XCTAssertEqual(s.index, 2)
        XCTAssertEqual(s.phase, .ask)
        XCTAssertEqual(s.greatFirst, 0)
    }

    func testEightRoundsThenDoneWithTheStars() throws {
        var s = PronunciationSession(words: try words(8))
        for i in 0..<8 {
            XCTAssertEqual(s.index, i)
            XCTAssertEqual(s.phase, .ask)
            if i < 6 { s.submit(transcript: "word\(i)", confidence: 0.95, course: .english) }
            if i == 7 { XCTAssertEqual(s.skipLabel, "Finish") }
            s.next()
        }
        XCTAssertEqual(s.phase, .done)
        XCTAssertEqual(s.greatFirst, 6)
        XCTAssertEqual(s.stars, 3)
    }

    func testAFinishedSessionIgnoresFurtherInput() throws {
        var s = PronunciationSession(words: try words(1))
        s.submit(transcript: "word0", confidence: 0.95, course: .english)
        s.next()
        XCTAssertEqual(s.phase, .done)
        XCTAssertEqual(s.submit(transcript: "word0", confidence: 0.95, course: .english), .unheard)
        XCTAssertEqual(s.greatFirst, 1)
    }

    func testNoWordsIsDoneAtOnce() {
        XCTAssertEqual(PronunciationSession(words: []).phase, .done)
    }

    // MARK: same endpoints (the speaking quota, not a new kind) and the confidence is passed through

    func testSpeechGoesToTheExistingSttRouteReturningTheConfidenceAndModelAudioToTts() async throws {
        let seen = TestCapture<[URLRequest]>([])
        let client = AIConversationClient(
            baseURL: URL(string: "https://example.test")!, accessToken: { "t" },
            requester: { request in
                seen.value.append(request)
                let body = request.url!.path.hasSuffix("/stt")
                    ? try! JSONSerialization.data(withJSONObject: ["text": "perro", "confidence": 0.72]) : Data([1, 2])
                return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            })
        let heard = try await Pronunciation.transcribe(client, audio: Data([9]), course: .spanish)
        _ = try await Pronunciation.modelAudio(client, term: "perro", voice: nil, course: .spanish)
        XCTAssertEqual(heard.text, "perro")
        XCTAssertEqual(heard.confidence, 0.72)
        XCTAssertEqual(seen.value.map { $0.url!.path }, ["/api/stt", "/api/tts"])
        let sttBody = String(decoding: seen.value[0].httpBody ?? Data(), as: UTF8.self)
        XCTAssertTrue(sttBody.contains("\r\n\r\nes\r\n"))
    }
}
