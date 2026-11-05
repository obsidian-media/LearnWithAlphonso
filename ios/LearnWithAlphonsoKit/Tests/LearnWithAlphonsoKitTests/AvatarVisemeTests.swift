import XCTest
@testable import LearnWithAlphonsoKit

final class AvatarVisemeTests: XCTestCase {
    private func seq(_ word: String, _ course: Course) -> [AvatarViseme] {
        AvatarVisemes.sequence(for: word, course: course)
    }

    func testEnglishWords() {
        XCTAssertEqual(seq("hello", .english), [.half, .ee, .talk, .oh])
        XCTAssertEqual(seq("map", .english), [.closed, .ah, .closed])
        XCTAssertEqual(seq("book", .english), [.closed, .oh, .half])
        XCTAssertEqual(seq("phone", .english), [.fv, .oh, .talk])
    }

    func testEnglishSilentFinalEIsDroppedOnlyInLongerWords() {
        XCTAssertEqual(seq("face", .english), [.fv, .ah, .half])
        XCTAssertEqual(seq("the", .english), [.talk, .half, .ee])
    }

    func testFrenchWords() {
        XCTAssertEqual(seq("bonjour", .french), [.closed, .oh, .talk, .half, .oh, .talk])
        XCTAssertEqual(seq("café", .french), [.half, .ah, .fv, .ee])
        XCTAssertEqual(seq("merci", .french), [.closed, .ee, .talk, .half, .ee])
        XCTAssertEqual(seq("être", .french), [.ee, .talk])
    }

    func testSpanishWords() {
        XCTAssertEqual(seq("hola", .spanish), [.oh, .talk, .ah])
        XCTAssertEqual(seq("queso", .spanish), [.half, .ee, .talk, .oh])
        XCTAssertEqual(seq("adiós", .spanish), [.ah, .talk, .ee, .oh, .talk])
        XCTAssertEqual(seq("está", .spanish), [.ee, .talk, .ah])
        XCTAssertEqual(seq("vino", .spanish), [.fv, .ee, .talk, .oh])
    }

    func testPunctuationDigitsAndCaseAreIgnored() {
        XCTAssertEqual(seq("Hello,", .english), seq("hello", .english))
        XCTAssertEqual(seq("¿Cómo", .spanish), seq("como", .spanish))
        XCTAssertEqual(seq("42", .english), [])
        XCTAssertEqual(seq("", .french), [])
        XCTAssertEqual(seq("?!", .spanish), [])
    }

    func testNeverRepeatsAShapeBackToBack() {
        for word in ["letter", "mama", "coffee", "ssss", "llamar"] {
            let s = seq(word, .english)
            for (a, b) in zip(s, s.dropFirst()) { XCTAssertNotEqual(a, b, word) }
        }
    }
}
