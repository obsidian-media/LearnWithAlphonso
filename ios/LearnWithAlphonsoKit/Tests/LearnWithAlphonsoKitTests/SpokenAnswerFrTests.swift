import XCTest

@testable import LearnWithAlphonsoKit

/// The vectors here are deliberately the SAME vectors as
/// src/lib/spoken-answer-fr.test.ts and supabase/functions/grade-review's
/// spoken-answer-fr.test.ts. The rule is implemented three times because it
/// runs in three runtimes; these shared vectors are what stop the three
/// drifting -- see SpokenAnswerFr.swift's header for the full reasoning.
final class SpokenAnswerFrTests: XCTestCase {
    func testStripsPunctuationAndCase() {
        XCTAssertEqual(
            SpokenAnswerFr.normalise("Bonjour, Comment allez-vous ?!"),
            SpokenAnswerFr.normalise("bonjour comment allez vous"))
    }

    func testFoldsAccentsRatherThanDeleting() {
        XCTAssertEqual(SpokenAnswerFr.normalise("l'élève"), SpokenAnswerFr.normalise("l'eleve"))
        XCTAssertEqual(SpokenAnswerFr.normalise("à bientôt"), SpokenAnswerFr.normalise("a bientot"))
    }

    func testCollapsesWhitespace() {
        XCTAssertEqual(
            SpokenAnswerFr.normalise("  bonjour   madame "),
            SpokenAnswerFr.normalise("bonjour madame"))
    }

    func testTreatsAnElidedFormAndItsSpaceSeparatedSpellingAsTheSame() {
        XCTAssertEqual(SpokenAnswerFr.normalise("j'ai faim"), SpokenAnswerFr.normalise("jai faim"))
        XCTAssertEqual(SpokenAnswerFr.normalise("j'ai faim"), SpokenAnswerFr.normalise("j ai faim"))
        XCTAssertEqual(SpokenAnswerFr.normalise("l'école"), SpokenAnswerFr.normalise("l ecole"))
        XCTAssertEqual(SpokenAnswerFr.normalise("c'est"), SpokenAnswerFr.normalise("c est"))
        XCTAssertEqual(
            SpokenAnswerFr.normalise("qu'est-ce que c'est"),
            SpokenAnswerFr.normalise("qu est ce que c est"))
    }

    /// `si` elides only before "il"/"ils", not before any vowel-initial word.
    func testElidesSiOnlyBeforeIlIls() {
        XCTAssertEqual(
            SpokenAnswerFr.normalise("s'il vous plaît"), SpokenAnswerFr.normalise("s il vous plait"))
        XCTAssertEqual(
            SpokenAnswerFr.normalise("s'ils viennent"), SpokenAnswerFr.normalise("s ils viennent"))
        XCTAssertNotEqual(
            SpokenAnswerFr.normalise("si elle vient"), SpokenAnswerFr.normalise("s elle vient"))
        XCTAssertEqual(
            SpokenAnswerFr.normalise("si elle vient"), SpokenAnswerFr.normalise("si elle vient"))
    }

    func testAcceptsTheExpectedPhraseHoweverTheElisionWasTranscribed() {
        XCTAssertTrue(SpokenAnswerFr.matches(transcript: "J'ai faim.", expected: "j'ai faim"))
        XCTAssertTrue(SpokenAnswerFr.matches(transcript: "j ai faim", expected: "J'ai faim."))
        XCTAssertTrue(SpokenAnswerFr.matches(transcript: "jai faim", expected: "J'ai faim."))
    }

    func testForgivesALeadingFillerWord() {
        XCTAssertTrue(SpokenAnswerFr.matches(transcript: "euh, bonjour", expected: "Bonjour."))
        XCTAssertTrue(SpokenAnswerFr.matches(transcript: "hum bonjour", expected: "Bonjour."))
    }

    func testRejectsADifferentSentence() {
        XCTAssertFalse(
            SpokenAnswerFr.matches(transcript: "il est fatigué", expected: "Elle est fatiguée."))
    }

    func testRejectsAPartialAttempt() {
        XCTAssertFalse(
            SpokenAnswerFr.matches(transcript: "bonjour", expected: "Bonjour, comment allez-vous ?"))
    }

    func testTreatsAnEmptyTranscriptAsNoAnswer() {
        XCTAssertFalse(SpokenAnswerFr.matches(transcript: "", expected: "Bonjour."))
        XCTAssertFalse(SpokenAnswerFr.matches(transcript: "   ", expected: "Bonjour."))
    }

    func testMatchesANumberWordAgainstTheNumeralReturned() {
        XCTAssertTrue(
            SpokenAnswerFr.matches(transcript: "j'ai deux frères", expected: "J'ai 2 frères."))
        XCTAssertTrue(
            SpokenAnswerFr.matches(transcript: "il est cinq heures", expected: "Il est 5 heures."))
        XCTAssertFalse(
            SpokenAnswerFr.matches(transcript: "j'ai trois frères", expected: "J'ai deux frères."))
    }

    /// The bare-word hazard the design spec names by name: mapping un/une
    /// unconditionally would turn "un chat" (a cat) into "1 chat".
    func testDoesNotMapUnUneToOne() {
        XCTAssertNotEqual(SpokenAnswerFr.normalise("un chat"), SpokenAnswerFr.normalise("1 chat"))
        XCTAssertEqual(SpokenAnswerFr.normalise("un chat"), SpokenAnswerFr.normalise("un chat"))
    }

    func testDoesNotCorruptRealWordsContainingAFillerAsASubstring() {
        XCTAssertTrue(
            SpokenAnswerFr.matches(transcript: "un être humain", expected: "Un être humain."))
        XCTAssertTrue(
            SpokenAnswerFr.matches(
                transcript: "il est de bonne humeur", expected: "Il est de bonne humeur."))
    }
}
