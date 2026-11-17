import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class SayThePictureTests: XCTestCase {
    private let base = VocabImagePolicy.allowedURLPrefix
    private func image(_ name: String) -> VocabImageRef { VocabImageRef(url: base + name + ".jpg", alt: name, credit: "c") }
    /// A Unit has no public initialiser (it is only ever decoded), so build one the way the app does.
    private func unit(_ answers: [String]) throws -> Unit {
        let questions = answers.enumerated().map {
            #"{"type":"fill","id":"q\#($0.offset)","prompt":"I see a ___.","bank":["\#($0.element)"],"answer":"\#($0.element)","explanation":"x"}"#
        }.joined(separator: ",")
        let json = #"{"id":"u1","level":"A1","eyebrow":"e","title":"t","description":"d","lessons":[{"id":"l1","title":"t","subtitle":"s","questions":[\#(questions)]}]}"#
        return try JSONDecoder().decode(Unit.self, from: Data(json.utf8))
    }
    private func words(_ n: Int) -> [SayThePicture.PictureWord] {
        (0..<n).map { SayThePicture.PictureWord(term: "word\($0)", image: image("w\($0)")) }
    }

    // MARK: live pool

    func testPoolKeepsOnlyWordsWithAPicture() throws {
        let u = try unit(["dog", "cat", "idea"])
        let pool = SayThePicture.pool(units: [u], images: ["dog": image("dog"), "cat": image("cat")])
        XCTAssertEqual(pool.map(\.term), ["dog", "cat"])
    }

    func testANewlyImageTaggedWordAppearsInThePoolOnTheNextCall() throws {
        let u = try unit(["dog", "cat", "idea"])
        var images = ["dog": image("dog")]
        XCTAssertEqual(SayThePicture.pool(units: [u], images: images).map(\.term), ["dog"])
        images["idea"] = image("idea")  // a new photo batch lands
        XCTAssertEqual(SayThePicture.pool(units: [u], images: images).map(\.term), ["dog", "idea"])
    }

    func testAnUnrenderableImageUrlIsNotInThePool() throws {
        let u = try unit(["dog"])
        let bad = VocabImageRef(url: "https://pixabay.com/get/x.jpg", alt: "a", credit: "c")
        XCTAssertTrue(SayThePicture.pool(units: [u], images: ["dog": bad]).isEmpty)
    }

    func testPoolDeduplicatesByTermIgnoringCase() throws {
        let u = try unit(["Dog", "dog"])
        XCTAssertEqual(SayThePicture.pool(units: [u], images: ["dog": image("dog")]).count, 1)
    }

    // MARK: rounds

    func testDrawGivesEightDistinctWordsOfALargerPool() {
        let drawn = SayThePicture.draw(words(20))
        XCTAssertEqual(drawn.count, 8)
        XCTAssertEqual(Set(drawn.map(\.term)).count, 8)
    }

    func testDrawGivesAWholeSmallPool() {
        XCTAssertEqual(SayThePicture.draw(words(5)).count, 5)
    }

    // MARK: forgiving grade

    func testSayingTheWordOrItInAPhraseIsAHit() {
        XCTAssertTrue(SayThePicture.said("Dog.", term: "dog", course: .english))
        XCTAssertTrue(SayThePicture.said("a dog", term: "dog", course: .english))
        XCTAssertTrue(SayThePicture.said("el abogado", term: "abogado", course: .spanish))
    }

    func testAnotherWordSilenceAndASubstringAreMisses() {
        XCTAssertFalse(SayThePicture.said("cat", term: "dog", course: .english))
        XCTAssertFalse(SayThePicture.said("", term: "dog", course: .english))
        XCTAssertFalse(SayThePicture.said("hotdog", term: "dog", course: .english))
    }

    func testStarsAreByShareAndNeverBelowOne() {
        XCTAssertEqual(SayThePicture.stars(correct: 8, total: 8), 3)
        XCTAssertEqual(SayThePicture.stars(correct: 6, total: 8), 3)
        XCTAssertEqual(SayThePicture.stars(correct: 4, total: 8), 2)
        XCTAssertEqual(SayThePicture.stars(correct: 0, total: 8), 1)
        XCTAssertEqual(SayThePicture.stars(correct: 0, total: 0), 1)
    }

    // MARK: session flow

    func testACorrectAnswerEarnsTheStarThenNextAdvances() {
        var s = SayThePictureSession(words: words(8))
        XCTAssertEqual(s.submit(transcript: "word0", course: .english), .right)
        XCTAssertEqual(s.phase, .right)
        XCTAssertEqual(s.firstTry, 1)
        s.next()
        XCTAssertEqual(s.index, 1)
        XCTAssertEqual(s.phase, .ask)
    }

    func testAMissRevealsTheWordThenARepeatEndsItAndTheSessionGoesOn() {
        var s = SayThePictureSession(words: words(8))
        XCTAssertEqual(s.submit(transcript: "banana", course: .english), .reveal)
        XCTAssertEqual(s.phase, .reveal)
        XCTAssertEqual(s.firstTry, 0)
        // Whatever is said in the repeat, the word is done and nothing is scored.
        XCTAssertEqual(s.submit(transcript: "anything", course: .english), .repeated)
        XCTAssertEqual(s.heard, "anything")
        XCTAssertEqual(s.firstTry, 0)
        s.next()
        XCTAssertEqual(s.index, 1)
        XCTAssertNil(s.heard)
    }

    func testShowMeTheWordWorksWithNoMicAndOnlyWhileAsking() {
        var s = SayThePictureSession(words: words(8))
        XCTAssertTrue(s.showWord())
        XCTAssertEqual(s.phase, .reveal)
        XCTAssertFalse(s.showWord())
        s.next()
        XCTAssertEqual(s.phase, .ask)
    }

    func testSilenceIsNotAMiss() {
        var s = SayThePictureSession(words: words(8))
        XCTAssertEqual(s.submit(transcript: "  ", course: .english), .unheard)
        XCTAssertEqual(s.phase, .ask)
    }

    func testEightRoundsThenDoneWithTheStars() {
        var s = SayThePictureSession(words: words(8))
        for i in 0..<8 {
            XCTAssertEqual(s.index, i)
            XCTAssertEqual(s.phase, .ask)
            if i < 6 { s.submit(transcript: "word\(i)", course: .english) } else { s.showWord() }
            if i == 7 { XCTAssertEqual(s.nextWordLabel, "Finish") }
            s.next()
        }
        XCTAssertEqual(s.phase, .done)
        XCTAssertEqual(s.firstTry, 6)
        XCTAssertEqual(s.stars, 3)
    }

    func testAFinishedSessionIgnoresFurtherInput() {
        var s = SayThePictureSession(words: words(1))
        s.submit(transcript: "word0", course: .english)
        s.next()
        XCTAssertEqual(s.phase, .done)
        XCTAssertEqual(s.submit(transcript: "word0", course: .english), .unheard)
        XCTAssertEqual(s.firstTry, 1)
    }

    // MARK: same endpoints (the speaking quota, not a new kind)

    func testSpeechGoesToTheExistingSttRouteWithTheCourseAndModelAudioToTts() async throws {
        let seen = TestCapture<[URLRequest]>([])
        let client = AIConversationClient(
            baseURL: URL(string: "https://example.test")!, accessToken: { "t" },
            requester: { request in
                seen.value.append(request)
                let body = request.url!.path.hasSuffix("/stt")
                    ? try! JSONSerialization.data(withJSONObject: ["text": "perro"]) : Data([1, 2])
                return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            })
        let text = try await SayThePicture.transcribe(client, audio: Data([9]), course: .spanish)
        _ = try await SayThePicture.modelAudio(client, term: "perro", voice: nil, course: .spanish)
        XCTAssertEqual(text, "perro")
        XCTAssertEqual(seen.value.map { $0.url!.path }, ["/api/stt", "/api/tts"])
        let sttBody = String(decoding: seen.value[0].httpBody ?? Data(), as: UTF8.self)
        XCTAssertTrue(sttBody.contains("\r\n\r\nes\r\n"))
    }
}
