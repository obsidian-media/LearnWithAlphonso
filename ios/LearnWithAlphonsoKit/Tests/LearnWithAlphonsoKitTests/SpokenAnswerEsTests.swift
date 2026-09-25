import XCTest

@testable import LearnWithAlphonsoKit

/// The vectors here are deliberately the SAME vectors as
/// src/lib/spoken-answer-es.test.ts and supabase/functions/grade-review's
/// spoken-answer-es.test.ts. The rule is implemented three times because it
/// runs in three runtimes; these shared vectors are what stop the three
/// drifting -- see SpokenAnswerEs.swift's header for the full reasoning.
final class SpokenAnswerEsTests: XCTestCase {
    func testStripsPunctuationAndCase() {
        XCTAssertEqual(
            SpokenAnswerEs.normalise("¡Hola! ¿Cómo estás?"),
            SpokenAnswerEs.normalise("hola como estas"))
    }

    func testFoldsAccentsRatherThanDeleting() {
        XCTAssertEqual(SpokenAnswerEs.normalise("está"), SpokenAnswerEs.normalise("esta"))
        XCTAssertEqual(SpokenAnswerEs.normalise("años"), SpokenAnswerEs.normalise("anos"))
        XCTAssertNotEqual(SpokenAnswerEs.normalise("sí"), SpokenAnswerEs.normalise("no"))
        XCTAssertEqual(SpokenAnswerEs.normalise("sí"), SpokenAnswerEs.normalise("si"))
    }

    func testCollapsesWhitespace() {
        XCTAssertEqual(
            SpokenAnswerEs.normalise("  hola   señora "),
            SpokenAnswerEs.normalise("hola senora"))
    }

    func testDropsASilentH() {
        XCTAssertEqual(SpokenAnswerEs.normalise("hola"), SpokenAnswerEs.normalise("ola"))
        XCTAssertEqual(SpokenAnswerEs.normalise("ahora"), SpokenAnswerEs.normalise("aora"))
        XCTAssertEqual(
            SpokenAnswerEs.normalise("zanahoria"), SpokenAnswerEs.normalise("zanaoria"))
        XCTAssertEqual(
            SpokenAnswerEs.normalise("tengo dos hermanas"),
            SpokenAnswerEs.normalise("tengo dos ermanas"))
    }

    /// "ch" is its own consonant sound, not a silent h after a c.
    func testKeepsTheHInTheChDigraph() {
        XCTAssertNotEqual(SpokenAnswerEs.normalise("chico"), SpokenAnswerEs.normalise("cico"))
        XCTAssertNotEqual(SpokenAnswerEs.normalise("coche"), SpokenAnswerEs.normalise("coce"))
        XCTAssertEqual(SpokenAnswerEs.normalise("chico"), SpokenAnswerEs.normalise("chico"))
    }

    func testAcceptsTheExpectedPhraseHoweverTheSilentHWasTranscribed() {
        XCTAssertTrue(
            SpokenAnswerEs.matches(transcript: "Hola, ¿qué tal?", expected: "hola que tal"))
        XCTAssertTrue(
            SpokenAnswerEs.matches(transcript: "ola que tal", expected: "Hola, ¿qué tal?"))
    }

    func testForgivesALeadingFillerWord() {
        XCTAssertTrue(SpokenAnswerEs.matches(transcript: "eh, hola", expected: "Hola."))
    }

    func testRejectsADifferentSentence() {
        XCTAssertFalse(
            SpokenAnswerEs.matches(transcript: "el esta cansado", expected: "Ella está cansada."))
    }

    func testRejectsAPartialAttempt() {
        XCTAssertFalse(
            SpokenAnswerEs.matches(transcript: "hola", expected: "Hola, ¿cómo estás?"))
    }

    func testTreatsAnEmptyTranscriptAsNoAnswer() {
        XCTAssertFalse(SpokenAnswerEs.matches(transcript: "", expected: "Hola."))
        XCTAssertFalse(SpokenAnswerEs.matches(transcript: "   ", expected: "Hola."))
    }

    func testMatchesANumberWordAgainstTheNumeralReturned() {
        XCTAssertTrue(
            SpokenAnswerEs.matches(transcript: "tengo dos hermanos", expected: "Tengo 2 hermanos."))
        XCTAssertTrue(SpokenAnswerEs.matches(transcript: "son las cinco", expected: "Son las 5."))
        XCTAssertTrue(
            SpokenAnswerEs.matches(
                transcript: "tengo veinte anos", expected: "Tengo veinte años."))
        XCTAssertTrue(
            SpokenAnswerEs.matches(
                transcript: "tengo dieciseis anos", expected: "Tengo dieciséis años."))
        XCTAssertTrue(
            SpokenAnswerEs.matches(
                transcript: "hay veintidos personas", expected: "Hay veintidós personas."))
        XCTAssertFalse(
            SpokenAnswerEs.matches(
                transcript: "tengo tres hermanos", expected: "Tengo dos hermanos."))
    }

    /// The bare-word hazard SpokenAnswerFr's tests name explicitly for
    /// un/une: mapping un/una unconditionally would turn "un gato" (a cat)
    /// into "1 gato".
    func testDoesNotMapUnUnaToOne() {
        XCTAssertNotEqual(SpokenAnswerEs.normalise("un gato"), SpokenAnswerEs.normalise("1 gato"))
        XCTAssertNotEqual(
            SpokenAnswerEs.normalise("una casa"), SpokenAnswerEs.normalise("1 casa"))
        XCTAssertEqual(SpokenAnswerEs.normalise("un gato"), SpokenAnswerEs.normalise("un gato"))
    }

    func testMatchesRoundHundredThousand() {
        XCTAssertTrue(
            SpokenAnswerEs.matches(transcript: "hay cien personas", expected: "Hay 100 personas."))
        XCTAssertTrue(
            SpokenAnswerEs.matches(transcript: "hay mil personas", expected: "Hay 1000 personas."))
    }

    /// Pins the ordering itself: the silent-h strip runs after the filler
    /// check, so a real word like "dehesa" never gets its "eh" mistaken for
    /// the filler -- see SpokenAnswerEs.swift's `normalise` comment.
    func testStripsTheSilentHBeforeTheFillerCheckRuns() {
        XCTAssertEqual(SpokenAnswerEs.normalise("dehesa"), SpokenAnswerEs.normalise("deesa"))
    }
}
