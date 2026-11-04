import XCTest
@testable import LearnWithAlphonsoKit

/// Where a lesson's text may offer "save this word".
///
/// A saved word is filed under a course and explained by the model as a word OF
/// THAT LANGUAGE. A lesson's explanation is English in every course, with French
/// or Spanish quoted inside it. English: every word is the course's. French and
/// Spanish: only the course-language text the question proves
/// (`CourseLanguageSpans`). Mirrors src/lib/saved-word-client.ts and
/// src/lib/course-language-spans.test.ts.
final class SavedWordPolicyTests: XCTestCase {
    private let salut = Question.fillInBlank(
        .init(
            id: "q", prompt: "How do you say \"hello\" in French? ___", bank: ["Salut", "Bonsoir"],
            answer: "Salut", explanation: "hello (informal) → Salut. Core greetings."))

    func testTheThreeCoursesAllowSavingAndOnlyEnglishSavesWholeText() {
        for code in ["en", "fr", "es"] { XCTAssertTrue(SavedWordPolicy.allowsSaving(inCourse: code), code) }
        XCTAssertTrue(SavedWordPolicy.savesWholeText(inCourse: "en"))
        XCTAssertFalse(SavedWordPolicy.savesWholeText(inCourse: "fr"))
        XCTAssertFalse(SavedWordPolicy.savesWholeText(inCourse: "es"))
    }

    func testAnUnknownOrEmptyCourseNeverAllowsSaving() {
        for code in ["", "de", "EN"] {
            XCTAssertFalse(SavedWordPolicy.allowsSaving(inCourse: code), code)
            XCTAssertEqual(SavedWordPolicy.scope(for: salut, explanation: "x", inCourse: code), .none, code)
        }
    }

    func testEnglishOffersTheWholeExplanation() {
        XCTAssertEqual(SavedWordPolicy.scope(for: salut, explanation: "anything", inCourse: "en"), .wholeText)
    }

    func testFrenchOffersOnlyTheProvenSpan() {
        XCTAssertEqual(
            SavedWordPolicy.scope(for: salut, explanation: "hello (informal) → Salut. Core greetings.", inCourse: "fr"),
            .spans(["Salut"]))
    }

    func testFrenchOffersNothingWhenTheExplanationDoesNotQuoteTheTarget() {
        XCTAssertEqual(SavedWordPolicy.scope(for: salut, explanation: "Say it with a Salut.", inCourse: "fr"), .none)
    }
}
