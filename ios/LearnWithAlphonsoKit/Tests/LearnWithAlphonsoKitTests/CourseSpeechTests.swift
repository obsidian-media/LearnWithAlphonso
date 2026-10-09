import XCTest
@testable import LearnWithAlphonsoKit

/// Spanish is Latin American, so on-device lesson speech uses es-MX.
final class CourseSpeechTests: XCTestCase {
    func testSpanishLessonSpeechIsMexicanSpanish() {
        XCTAssertEqual(Course.spanish.speechLocale, "es-MX")
    }

    func testEnglishAndFrenchAreUnchanged() {
        XCTAssertEqual(Course.english.speechLocale, "en-US")
        XCTAssertEqual(Course.french.speechLocale, "fr-FR")
    }

    func testTheFirstCandidateIsTheCourseLocale() {
        for course in [Course.english, .french, .spanish] {
            XCTAssertEqual(course.speechLocaleCandidates.first, course.speechLocale)
        }
    }

    func testSpanishNeverFallsBackToSpainsVoice() {
        XCTAssertFalse(Course.spanish.speechLocaleCandidates.contains("es-ES"))
        XCTAssertEqual(Course.spanish.speechLocaleCandidates, ["es-MX", "es-US"])
    }
}
