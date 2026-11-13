import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// Each guard below names the production change that turns its test red (mutation pairs, for the owner's report).
final class ExplainRulesTests: XCTestCase {
    // MARK: direction

    /// Red if "ps" (or any of the five) is removed from ExplainRules.rtlLanguages, or "ku" is added to it.
    func testDirectionTableIsRtlForArFaHeUrPsAndLtrForEverythingElse() {
        for code in ["ar", "fa", "he", "ur", "ps"] {
            XCTAssertEqual(ExplainRules.languageDirection(code), .rtl, code)
        }
        for code in ["en", "fr", "es", "ku", "zh", "hi", "tr", "ru", "sw"] {
            XCTAssertEqual(ExplainRules.languageDirection(code), .ltr, code)
        }
    }

    /// Red if the table stops covering every nativeLanguages entry the web marks right to left (the web test pins the same five).
    func testExactlyFiveOfTheFiftyEightNativeLanguagesAreRtl() {
        XCTAssertEqual(LearnerProfileLists.nativeLanguages.count, 58)
        let rtl = LearnerProfileLists.nativeLanguages.filter { ExplainRules.languageDirection($0) == .rtl }
        XCTAssertEqual(Set(rtl), ["ar", "fa", "he", "ur", "ps"])
    }

    func testLanguageNameIsTheEnglishName() {
        XCTAssertEqual(ExplainRules.languageName("fa"), "Persian")
        XCTAssertEqual(ExplainRules.languageName("ar"), "Arabic")
        XCTAssertEqual(ExplainRules.languageName("es"), "Spanish")
    }

    func testDailyLimitIsForty() {
        XCTAssertEqual(ExplainRules.dailyLimit, 40)
    }

    // MARK: mode

    /// Red if ExplainMode.default becomes .always or .off, or parse stops falling back to it.
    func testModeDefaultsToTapWhenNothingOrJunkIsSaved() {
        XCTAssertEqual(ExplainMode.default, .tap)
        XCTAssertEqual(ExplainMode.parse(nil), .tap)
        XCTAssertEqual(ExplainMode.parse("sometimes"), .tap)
        XCTAssertEqual(ExplainMode.parse(7), .tap)
        XCTAssertEqual(ExplainMode.parse("always"), .always)
        XCTAssertEqual(ExplainMode.parse("off"), .off)
        XCTAssertEqual(ExplainMode.parse("tap"), .tap)
    }

    func testModeTitlesMatchTheApprovedMock() {
        XCTAssertEqual(ExplainMode.tap.title, "Tap to explain")
        XCTAssertEqual(ExplainMode.always.title, "Always show")
        XCTAssertEqual(ExplainMode.off.title, "Target language only")
        XCTAssertEqual(ExplainMode.allCases, [.tap, .always, .off])
    }

    // MARK: offer gating

    /// Red if the `.off` early return in ExplainRules.offer is removed.
    func testOffModeHidesEverythingEvenWithANativeLanguage() {
        XCTAssertEqual(ExplainRules.offer(mode: .off, nativeLanguage: "fa", course: "en"), .hidden)
    }

    /// Red if the nil check on nativeLanguage is dropped from ExplainRules.offer.
    func testNoNativeLanguageHidesTheOffer() {
        XCTAssertEqual(ExplainRules.offer(mode: .tap, nativeLanguage: nil, course: "en"), .hidden)
        XCTAssertEqual(ExplainRules.offer(mode: .always, nativeLanguage: nil, course: "en"), .hidden)
    }

    /// Red if the isEmpty check on nativeLanguage is dropped from ExplainRules.offer.
    func testEmptyNativeLanguageHidesTheOffer() {
        XCTAssertEqual(ExplainRules.offer(mode: .tap, nativeLanguage: "", course: "en"), .hidden)
    }

    /// Red if the `nativeLanguage != course` comparison is dropped from ExplainRules.offer.
    func testNativeEqualToTheCourseHidesTheOffer() {
        XCTAssertEqual(ExplainRules.offer(mode: .tap, nativeLanguage: "fr", course: "fr"), .hidden)
        XCTAssertEqual(ExplainRules.offer(mode: .always, nativeLanguage: "es", course: "es"), .hidden)
    }

    /// Red if tap and always are swapped in ExplainRules.offer.
    func testTapIsAChipAndAlwaysIsAutoWhenTheLanguagesDiffer() {
        XCTAssertEqual(ExplainRules.offer(mode: .tap, nativeLanguage: "fa", course: "en"), .chip)
        XCTAssertEqual(ExplainRules.offer(mode: .always, nativeLanguage: "fa", course: "en"), .auto)
        XCTAssertEqual(ExplainRules.offer(mode: .tap, nativeLanguage: "en", course: "es"), .chip)
    }

    // MARK: request builders and caps

    /// Red if the wrong-answer cap changes from 400 or the cut is made by UTF-8 bytes instead of Characters.
    func testWrongAnswerFieldsAreCutAtFourHundredCharacters() throws {
        let long = String(repeating: "a", count: 500)
        let request = try XCTUnwrap(
            ExplainRequest.makeWrongAnswer(question: long, wrongAnswer: long, correctAnswer: long, course: "en"))
        guard case .wrongAnswer(let course, let q, let w, let c) = request else { return XCTFail("kind") }
        XCTAssertEqual(course, "en")
        XCTAssertEqual(q.count, 400)
        XCTAssertEqual(w.count, 400)
        XCTAssertEqual(c.count, 400)
    }

    /// Red if cut() uses utf8.count or unicodeScalars instead of Characters (a flag emoji would split).
    func testTheCutNeverSplitsAnEmoji() throws {
        let flags = String(repeating: "\u{1F1EB}\u{1F1F7}", count: 90)
        let request = try XCTUnwrap(ExplainRequest.makeWord(word: flags, sentence: nil, course: "fr"))
        guard case .word(_, let word, _) = request else { return XCTFail("kind") }
        XCTAssertEqual(word.count, 80)
        XCTAssertEqual(word, String(repeating: "\u{1F1EB}\u{1F1F7}", count: 80))
    }

    /// Red if the empty check on any of the three fields is removed from makeWrongAnswer.
    func testWrongAnswerWithAnEmptyFieldIsNil() {
        XCTAssertNil(ExplainRequest.makeWrongAnswer(question: "Q", wrongAnswer: "  ", correctAnswer: "C", course: "en"))
        XCTAssertNil(ExplainRequest.makeWrongAnswer(question: "", wrongAnswer: "W", correctAnswer: "C", course: "en"))
        XCTAssertNil(ExplainRequest.makeWrongAnswer(question: "Q", wrongAnswer: "W", correctAnswer: "\n", course: "en"))
    }

    /// Red if the word cap changes from 80 or the sentence cap from 400.
    func testWordIsCutAtEightyAndSentenceAtFourHundred() throws {
        let request = try XCTUnwrap(ExplainRequest.makeWord(
            word: String(repeating: "w", count: 120), sentence: String(repeating: "s", count: 450), course: "es"))
        guard case .word(let course, let word, let sentence) = request else { return XCTFail("kind") }
        XCTAssertEqual(course, "es")
        XCTAssertEqual(word.count, 80)
        XCTAssertEqual(sentence?.count, 400)
    }

    /// Red if an empty sentence is sent as "" instead of being left out (the server rejects an empty string).
    func testAnEmptySentenceIsLeftOutOfTheBody() throws {
        let request = try XCTUnwrap(ExplainRequest.makeWord(word: "hola", sentence: "   ", course: "es"))
        XCTAssertNil(request.jsonObject()["sentence"])
        XCTAssertEqual(request.jsonObject()["word"] as? String, "hola")
        XCTAssertNil(ExplainRequest.makeWord(word: "  ", sentence: "x", course: "es"))
    }

    /// Red if the message cap changes from 1000.
    func testMessageIsCutAtOneThousandCharacters() throws {
        let request = try XCTUnwrap(ExplainRequest.makeMessage(text: String(repeating: "m", count: 1200), course: "fr"))
        guard case .message(_, let text) = request else { return XCTFail("kind") }
        XCTAssertEqual(text.count, 1000)
        XCTAssertNil(ExplainRequest.makeMessage(text: " \n ", course: "fr"))
    }

    /// Red if the wire kind strings or key names drift from the route's strict schema.
    func testBodiesCarryExactlyTheRoutesKeys() throws {
        let wrong = try XCTUnwrap(ExplainRequest.makeWrongAnswer(
            question: " Q ", wrongAnswer: "W", correctAnswer: "C", course: "en")).jsonObject()
        XCTAssertEqual(wrong as NSDictionary, [
            "kind": "wrong-answer", "course": "en", "question": "Q", "wrongAnswer": "W", "correctAnswer": "C",
        ] as NSDictionary)
        let word = try XCTUnwrap(ExplainRequest.makeWord(word: "casa", sentence: "Mi casa.", course: "es")).jsonObject()
        XCTAssertEqual(word as NSDictionary, [
            "kind": "word", "course": "es", "word": "casa", "sentence": "Mi casa.",
        ] as NSDictionary)
        let message = try XCTUnwrap(ExplainRequest.makeMessage(text: "Bonjour", course: "fr")).jsonObject()
        XCTAssertEqual(message as NSDictionary, ["kind": "message", "course": "fr", "text": "Bonjour"] as NSDictionary)
    }

    /// Red if surface "hector" is no longer added for Hector, or is added for the app (the server would spend the wrong allowance).
    func testOnlyHectorSendsASurface() throws {
        let request = try XCTUnwrap(ExplainRequest.makeMessage(text: "Hi", course: "en"))
        XCTAssertNil(request.jsonObject(surface: .app)["surface"])
        XCTAssertEqual(request.jsonObject(surface: .hector)["surface"] as? String, "hector")
    }

    /// Red if the language is ever put in the body (the server reads it from the account).
    func testNoBodyEverCarriesALanguage() throws {
        let bodies = [
            try XCTUnwrap(ExplainRequest.makeMessage(text: "Hi", course: "en")).jsonObject(surface: .hector),
            try XCTUnwrap(ExplainRequest.makeWord(word: "hi", sentence: "hi there", course: "en")).jsonObject(),
        ]
        for body in bodies {
            XCTAssertNil(body["language"])
            XCTAssertNil(body["nativeLanguage"])
        }
    }

    // MARK: explanation text

    /// Red if the 700 cap in parseExplanation changes or trimming is dropped.
    func testExplanationIsTrimmedCappedAndNeverEmpty() {
        XCTAssertEqual(ExplainRules.parseExplanation("  hello \n"), "hello")
        XCTAssertNil(ExplainRules.parseExplanation("   "))
        XCTAssertNil(ExplainRules.parseExplanation(nil))
        XCTAssertNil(ExplainRules.parseExplanation(42))
        XCTAssertEqual(ExplainRules.parseExplanation(String(repeating: "x", count: 900))?.count, 700)
    }

    // MARK: direction runs

    /// Red if the Latin pattern is changed so a quoted phrase is split into pieces or leaks the Arabic words into the ltr run.
    func testALatinQuoteInsideRtlTextIsOneIsolatedRun() {
        let text = "از «I live here.» برای گفتن محل زندگی استفاده می‌شود."
        let runs = ExplainRules.splitDirectionRuns(text)
        XCTAssertEqual(runs.filter(\.ltr).map(\.text), ["I live here."])
        XCTAssertEqual(runs.filter { !$0.ltr }.count, 2)
    }

    /// Red if any piece is trimmed, dropped or duplicated while splitting.
    func testRunsRejoinToExactlyTheInput() {
        let samples = [
            "از «I live here.» برای گفتن محل زندگی استفاده می‌شود.",
            "كلمة cat و dog معاً",
            "no latin here: שלום",
            "Pure English only.",
            "",
            "123 ٤٥٦ abc, def! \u{1F600} ghi",
        ]
        for sample in samples {
            XCTAssertEqual(ExplainRules.splitDirectionRuns(sample).map(\.text).joined(), sample, sample)
        }
    }

    /// Red if text without any Latin letter is reported as an ltr run.
    func testTextWithoutLatinIsOneRtlPiece() {
        XCTAssertEqual(ExplainRules.splitDirectionRuns("שלום עולם"), [
            ExplainRules.DirectionRun(text: "שלום עולם", ltr: false),
        ])
        XCTAssertEqual(ExplainRules.splitDirectionRuns(""), [])
    }

    func testTwoQuotesGiveTwoSeparateRuns() {
        let runs = ExplainRules.splitDirectionRuns("بین cat و dog فرق است")
        XCTAssertEqual(runs.filter(\.ltr).map(\.text), ["cat", "dog"])
    }
}

final class ExplainClientTests: XCTestCase {
    private let baseURL = URL(string: "https://example.test")!

    private func reply(_ status: Int, _ object: [String: Any]?) -> @Sendable (URLRequest) async throws -> (Data, URLResponse) {
        let body = object.map { try! JSONSerialization.data(withJSONObject: $0) } ?? Data()
        return { request in
            (body, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    private let good: [String: Any] = [
        "explanation": "  Because...  ", "language": "fa", "direction": "rtl", "cached": true,
    ]

    private func expectError(
        _ expected: ExplainErrorKind, requester: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse),
        file: StaticString = #filePath, line: UInt = #line
    ) async {
        let client = ExplainClient(baseURL: baseURL, accessToken: { "tok" }, requester: requester)
        do {
            _ = try await client.explain(ExplainRequest.makeMessage(text: "Hi", course: "en")!)
            XCTFail("expected \(expected)", file: file, line: line)
        } catch let error as ExplainErrorKind {
            XCTAssertEqual(error, expected, file: file, line: line)
        } catch {
            XCTFail("wrong error \(error)", file: file, line: line)
        }
    }

    // MARK: status mapping

    /// Red if any arm of ExplainErrorKind.from(status:error:) is changed.
    func testStatusMapping() {
        XCTAssertEqual(ExplainErrorKind.from(status: 400, error: "same-language"), .unsupported)
        XCTAssertEqual(ExplainErrorKind.from(status: 400, error: "invalid-request"), .unsupported)
        XCTAssertEqual(ExplainErrorKind.from(status: 422, error: "unsupported-language"), .unsupported)
        XCTAssertEqual(ExplainErrorKind.from(status: 401, error: nil), .notSignedIn)
        XCTAssertEqual(ExplainErrorKind.from(status: 429, error: nil), .quotaExceeded)
        XCTAssertEqual(ExplainErrorKind.from(status: 502, error: nil), .unavailable)
        XCTAssertEqual(ExplainErrorKind.from(status: 503, error: "tutor-unavailable"), .unavailable)
        XCTAssertEqual(ExplainErrorKind.from(status: 500, error: nil), .unavailable)
    }

    /// Red if the 403 body split is removed (consent would read as "needs Hector Pro" or the reverse).
    func testA403IsConsentOrEntitlementDependingOnTheBody() {
        XCTAssertEqual(ExplainErrorKind.from(status: 403, error: "ai-consent-required"), .aiConsentRequired)
        XCTAssertEqual(ExplainErrorKind.from(status: 403, error: "not-entitled"), .notEntitled)
        XCTAssertEqual(ExplainErrorKind.from(status: 403, error: nil), .notEntitled)
    }

    func testTheClientReadsTheBodyToSplitThe403() async {
        await expectError(.aiConsentRequired, requester: reply(403, ["error": "ai-consent-required"]))
        await expectError(.notEntitled, requester: reply(403, ["error": "not-entitled"]))
        await expectError(.quotaExceeded, requester: reply(429, ["error": "quota"]))
        await expectError(.unsupported, requester: reply(422, ["error": "unsupported-language"]))
        await expectError(.unavailable, requester: reply(502, nil))
    }

    /// Red if a transport failure stops mapping to offline.
    func testATransportFailureIsOffline() async {
        await expectError(.offline, requester: { _ in throw URLError(.notConnectedToInternet) })
    }

    /// Red if a 200 with a missing or empty field stops being "unavailable".
    func testAMalformed200IsUnavailable() async {
        await expectError(.unavailable, requester: reply(200, ["explanation": "  ", "language": "fa", "direction": "rtl", "cached": false]))
        await expectError(.unavailable, requester: reply(200, ["explanation": "x", "language": "fa", "direction": "up", "cached": false]))
        await expectError(.unavailable, requester: reply(200, ["explanation": "x", "language": "fa", "direction": "rtl"]))
        await expectError(.unavailable, requester: reply(200, nil))
    }

    // MARK: copy

    /// Red if any user-facing string drifts from the web's explainErrorCopy.
    func testCopyForEveryErrorKind() {
        XCTAssertEqual(ExplainErrorKind.offline.copy, "Explaining needs a connection. Try again when you are back online.")
        XCTAssertEqual(ExplainErrorKind.quotaExceeded.copy, "You have used today's explanations. They come back tomorrow.")
        XCTAssertEqual(ExplainErrorKind.aiConsentRequired.copy, "AI features are turned off. Allow them to get explanations.")
        XCTAssertEqual(ExplainErrorKind.notSignedIn.copy, "Sign in again to get explanations.")
        XCTAssertEqual(ExplainErrorKind.notEntitled.copy, "Explanations in Hector need Hector Pro.")
        XCTAssertEqual(ExplainErrorKind.unsupported.copy, "There is no explanation in your language for this one.")
        XCTAssertEqual(ExplainErrorKind.unavailable.copy, "Couldn't explain that. Try again.")
        XCTAssertEqual(ExplainErrorKind.allCases.count, 7)
    }

    // MARK: the request on the wire

    /// Red if the path, method, bearer header or body keys of the call change.
    func testThePostCarriesTheBearerTokenAndTheItemOnly() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let ok = reply(200, good)
        let client = ExplainClient(baseURL: baseURL, accessToken: { "tok" }, requester: { request in
            captured.value = request
            return try await ok(request)
        })
        let result = try await client.explain(
            ExplainRequest.makeWord(word: "casa", sentence: nil, course: "es")!, surface: .hector)
        XCTAssertEqual(result, ExplainResult(explanation: "Because...", language: "fa", direction: .rtl, cached: true))
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.absoluteString, "https://example.test/api/explain")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        let payload = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? NSDictionary
        XCTAssertEqual(payload, ["kind": "word", "course": "es", "word": "casa", "surface": "hector"] as NSDictionary)
    }

    /// Red if the one refresh-and-retry on a 401 is removed.
    func testA401RefreshesTheTokenAndRetriesOnce() async throws {
        let calls = TestCapture<[String?]>([])
        let ok = reply(200, good)
        let unauthorized = reply(401, nil)
        let client = ExplainClient(
            baseURL: baseURL, accessToken: { "old" }, refreshAccessToken: { "new" },
            requester: { request in
                let token = request.value(forHTTPHeaderField: "Authorization")
                calls.value.append(token)
                return token == "Bearer new" ? try await ok(request) : try await unauthorized(request)
            })
        _ = try await client.explain(ExplainRequest.makeMessage(text: "Hi", course: "en")!)
        XCTAssertEqual(calls.value, ["Bearer old", "Bearer new"])
    }
}

final class ExplainProfileTests: XCTestCase {
    /// Red if ExplainMode parsing is removed from LearnerAnswers.parse.
    func testProfileParsesAKnownExplainModeAndDropsAnUnknownOne() {
        XCTAssertEqual(LearnerProfile.parse(["explainMode": "always"]).answers.explainMode, .always)
        XCTAssertEqual(LearnerProfile.parse(["explainMode": "off"]).answers.explainMode, .off)
        XCTAssertNil(LearnerProfile.parse(["explainMode": "sometimes"]).answers.explainMode)
        XCTAssertNil(LearnerProfile.parse(["explainMode": 3]).answers.explainMode)
        XCTAssertNil(LearnerProfile.parse([:]).answers.explainMode)
    }

    /// Red if effectiveExplainMode stops defaulting to tap.
    func testNothingSavedBehavesAsTapToExplain() {
        XCTAssertEqual(LearnerProfile.parse([:]).answers.effectiveExplainMode, .tap)
        XCTAssertEqual(LearnerProfile.parse(["explainMode": "bogus"]).answers.effectiveExplainMode, .tap)
        XCTAssertEqual(LearnerProfile.parse(["explainMode": "off"]).answers.effectiveExplainMode, .off)
    }

    /// Red if explainMode is dropped from jsonPatch (the Settings choice would never reach the account).
    func testThePatchCarriesExplainModeOnlyWhenSet() {
        XCTAssertEqual(LearnerAnswers(explainMode: .always).jsonPatch as NSDictionary, ["explainMode": "always"] as NSDictionary)
        XCTAssertNil(LearnerAnswers(goal: "work").jsonPatch["explainMode"])
        XCTAssertEqual(LearnerAnswers(nativeLanguage: "fa", explainMode: .off).jsonPatch["explainMode"] as? String, "off")
    }

    /// Red if the report surface for explanations is removed (the web posts surface "explain").
    func testTheReportSurfaceForExplanationsExists() {
        XCTAssertEqual(AIResponseSurface.explain.rawValue, "explain")
        let report = AIResponseReport(message: "m", surface: .explain, course: "en", reason: .incorrect)
        let context = report.jsonObject()["context"] as? [String: Any]
        XCTAssertEqual(context?["surface"] as? String, "explain")
    }
}
