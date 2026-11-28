import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Decodes the SAME contract the web tests pin (Fixtures/rehearsal-api.json is a byte-for-byte copy of
/// tests/fixtures/rehearsal-api.json, guarded by src/lib/rehearsal-native-fixtures.test.ts), and pins the rules the
/// Rehearsals screens rely on. The screens themselves stay thin; what they decide is decided here.
final class RehearsalsTests: XCTestCase {
    // MARK: - Fixture

    private func fixture() throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "rehearsal-api", withExtension: "json", subdirectory: "Fixtures"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    private func data(_ key: String) throws -> Data {
        try JSONSerialization.data(withJSONObject: try XCTUnwrap(try fixture()[key]))
    }

    private func state() throws -> RehearsalState {
        try XCTUnwrap(RehearsalDecoding.state(from: try data("state")))
    }

    func testTheSharedStateDecodes() throws {
        let s = try state()
        XCTAssertEqual(s.active?.eventKind, "interview")
        XCTAssertEqual(s.active?.kind, .interview)
        XCTAssertEqual(s.active?.eventDate, "2026-12-01")
        XCTAssertEqual(s.active?.counterpart, "a hiring manager at a logistics company")
        XCTAssertEqual(s.active?.free, true)
        XCTAssertEqual(s.nextStage, .conversation)
        XCTAssertEqual(s.progress?.isDone(.warmup), true)
        XCTAssertEqual(s.progress?.isDone(.conversation), false)
        XCTAssertEqual(s.runs.count, 1)
        XCTAssertEqual(s.runs.first?.rehearsalStage, .warmup)
        XCTAssertEqual(s.runs.first?.corrections, ["I am hoping for around 3000"])
        XCTAssertEqual(s.history.first?.runs, 6)
        XCTAssertEqual(s.history.first?.stagesDone, 3)
        XCTAssertEqual(s.history.first?.corrections, 4)
        XCTAssertFalse(s.freeAvailable)
    }

    func testTheEmptyStateDecodes() throws {
        let s = try XCTUnwrap(RehearsalDecoding.state(from: try data("stateEmpty")))
        XCTAssertNil(s.active)
        XCTAssertNil(s.progress)
        XCTAssertNil(s.nextStage)
        XCTAssertEqual(s.runs, [])
        XCTAssertEqual(s.history, [])
        XCTAssertTrue(s.freeAvailable)
    }

    func testAnOlderServersAnswerWithNoRunsReadsAsAnEmptyList() throws {
        var older = try XCTUnwrap(try fixture()["state"] as? [String: Any])
        older.removeValue(forKey: "runs")
        var history = try XCTUnwrap(older["history"] as? [[String: Any]])
        history[0].removeValue(forKey: "runs")
        older["history"] = history
        let s = try XCTUnwrap(RehearsalDecoding.state(from: try JSONSerialization.data(withJSONObject: older)))
        XCTAssertEqual(s.runs, [])
        XCTAssertEqual(s.history.first?.runs, 0)
    }

    func testAnAnswerThatIsNotAStateIsNil() throws {
        XCTAssertNil(RehearsalDecoding.state(from: Data("{\"nope\":true}".utf8)))
        XCTAssertNil(RehearsalDecoding.state(from: Data("null".utf8)))
        XCTAssertNil(RehearsalDecoding.state(from: Data("{\"active\":null,\"history\":[]}".utf8)))
    }

    func testTheAppConfigSwitchIsReadAndOffWhenMissing() throws {
        XCTAssertTrue(RehearsalDecoding.rehearsalsEnabled(inAppConfig: try data("appConfig")))
        XCTAssertFalse(RehearsalDecoding.rehearsalsEnabled(inAppConfig: Data("{\"features\":{\"rehearsals\":false}}".utf8)))
        XCTAssertFalse(RehearsalDecoding.rehearsalsEnabled(inAppConfig: Data("{}".utf8)))
        XCTAssertFalse(RehearsalDecoding.rehearsalsEnabled(inAppConfig: Data("{\"features\":{\"rehearsals\":\"yes\"}}".utf8)))
    }

    func testEveryFixtureErrorMapsToItsMeaning() throws {
        let rows = try XCTUnwrap(try fixture()["errors"] as? [[String: Any]])
        XCTAssertEqual(rows.count, 10)
        for row in rows {
            let status = try XCTUnwrap(row["status"] as? Int)
            let code = (row["body"] as? [String: Any])?["error"] as? String
            let means = try XCTUnwrap(row["means"] as? String)
            XCTAssertEqual(RehearsalError.from(status: status, code: code).rawValue, means, "\(status) \(code ?? "")")
        }
    }

    func testTheChatBodyFixtureMatchesWhatTheCallSends() throws {
        let expected = try XCTUnwrap(try fixture()["chatBody"] as? [String: Any])
        let rehearsal = try XCTUnwrap(expected["rehearsal"] as? [String: String])
        let body = CallSource.rehearsal(id: rehearsal["id"]!, stage: RehearsalStage(rawValue: rehearsal["stage"]!)!)
            .chatBody(systemPrompt: nil, cefrLevel: nil, course: nil, callId: nil, messages: [])
        XCTAssertEqual(body["rehearsal"] as? [String: String], rehearsal)
    }

    // MARK: - The path's pinned item (the shared learning-path fixture)

    private func path(_ key: String) throws -> LearningPath {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "learning-path.fixtures", withExtension: "json", subdirectory: "Fixtures"))
        let all = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let body = try JSONSerialization.data(withJSONObject: ["path": try XCTUnwrap(all[key])])
        return try XCTUnwrap(try LearningPathDecoding.path(from: body))
    }

    func testTheStagePinnedItemDecodes() throws {
        let p = try path("rehearsalStage")
        let item = try XCTUnwrap(p.pinnedItem)
        XCTAssertEqual(item.kind, "stage")
        XCTAssertEqual(item.rehearsalStage, .conversation)
        XCTAssertEqual(item.rehearsalId, "11111111-1111-4111-8111-111111111111")
        XCTAssertEqual(item.title, "The real conversation")
        XCTAssertEqual(item.minutes, 10)
        XCTAssertFalse(item.hero)
        XCTAssertNil(p.heroPinned, "a stage item never takes the hero")
    }

    func testTheEventDayPinnedItemTakesTheHero() throws {
        let p = try path("rehearsalEventDay")
        let hero = try XCTUnwrap(p.heroPinned)
        XCTAssertEqual(hero.kind, "warmup_today")
        XCTAssertEqual(hero.minutes, 2)
        XCTAssertEqual(hero.rehearsalStage, .warmup)
        XCTAssertTrue(hero.hero)
        XCTAssertEqual(hero.eventKind, "interview")
        XCTAssertEqual(RehearsalLearnEntry.heroTitle(kind: hero.rehearsalKind), "Interview today")
    }

    func testAPathWithNoPinnedKeyDecodesWithNoPinnedItem() throws {
        let p = try path("onTrack")
        XCTAssertNil(p.pinnedItem)
        XCTAssertNil(p.heroPinned)
    }

    // MARK: - Intake

    func testTheKindIsRequired() {
        let draft = RehearsalIntakeDraft(kind: nil, counterpart: "a hiring manager")
        XCTAssertEqual(draft.validate(course: "en"), .failure(.kindMissing))
        XCTAssertFalse(draft.canContinue(step: 1))
        XCTAssertTrue(RehearsalIntakeDraft(kind: .interview).canContinue(step: 1))
    }

    func testTheCounterpartIsRequiredAndAtMostTwoHundredCharacters() {
        var draft = RehearsalIntakeDraft(kind: .interview, counterpart: "   ")
        XCTAssertEqual(draft.validate(course: "en"), .failure(.counterpartMissing))
        XCTAssertFalse(draft.canContinue(step: 3))
        draft.counterpart = String(repeating: "a", count: 200)
        XCTAssertNotNil(try? draft.validate(course: "en").get())
        XCTAssertTrue(draft.canContinue(step: 3))
        draft.counterpart = String(repeating: "a", count: 201)
        XCTAssertEqual(draft.validate(course: "en"), .failure(.counterpartTooLong))
        XCTAssertFalse(draft.canContinue(step: 3))
    }

    func testTheWorriesAreOptionalAndAtMostTwoHundredCharacters() throws {
        var draft = RehearsalIntakeDraft(kind: .meeting, counterpart: "my team lead")
        XCTAssertNil(try draft.validate(course: "en").get().worries)
        draft.worries = "  "
        XCTAssertNil(try draft.validate(course: "en").get().worries, "blank worries are none")
        draft.worries = "  salary  "
        XCTAssertEqual(try draft.validate(course: "en").get().worries, "salary", "trimmed")
        draft.worries = String(repeating: "w", count: 200)
        XCTAssertTrue(draft.canContinue(step: 4))
        draft.worries = String(repeating: "w", count: 201)
        XCTAssertEqual(draft.validate(course: "en"), .failure(.worriesTooLong))
        XCTAssertFalse(draft.canContinue(step: 4))
    }

    func testTheDateIsOptionalButMustBeARealDay() throws {
        var draft = RehearsalIntakeDraft(kind: .housing, counterpart: "a landlord")
        XCTAssertNil(try draft.validate(course: "fr").get().eventDate, "not sure yet")
        XCTAssertTrue(draft.canContinue(step: 2))
        draft.eventDate = "2026-12-01"
        XCTAssertEqual(try draft.validate(course: "fr").get().eventDate, "2026-12-01")
        draft.eventDate = "2026-02-30"
        XCTAssertEqual(draft.validate(course: "fr"), .failure(.dateInvalid))
        XCTAssertFalse(draft.canContinue(step: 2))
    }

    func testTheIntakeBodyCarriesTheFourAnswersAndNullsForTheOptionalOnes() throws {
        let intake = try RehearsalIntakeDraft(kind: .firstDay, counterpart: " my new manager ").validate(course: "es").get()
        let body = RehearsalRequests.create(intake)
        XCTAssertEqual(body["action"] as? String, "create")
        XCTAssertEqual(body["course"] as? String, "es")
        XCTAssertEqual(body["eventKind"] as? String, "first_day")
        XCTAssertEqual(body["counterpart"] as? String, "my new manager")
        XCTAssertTrue(body["eventDate"] is NSNull)
        XCTAssertTrue(body["worries"] is NSNull)
    }

    func testEveryKindHasALabelAndAPlaceholderAndTheWireNamesMatchTheServer() {
        XCTAssertEqual(RehearsalEventKind.allCases.map(\.rawValue),
                       ["interview", "meeting", "presentation", "appointment", "housing", "first_day", "other"])
        XCTAssertEqual(RehearsalEventKind.allCases.count, 7)
        for kind in RehearsalEventKind.allCases {
            XCTAssertFalse(kind.label.isEmpty)
            XCTAssertTrue(kind.counterpartPlaceholder.hasPrefix("e.g. "))
        }
        XCTAssertEqual(RehearsalEventKind.housing.label, "Landlord or housing")
        XCTAssertEqual(RehearsalStage.allCases.map(\.rawValue), ["warmup", "conversation", "hard_moments"])
    }

    func testStepLabelsRunOneToFour() {
        XCTAssertEqual(RehearsalIntakeCopy.stepLabel(1), "Step 1 of 4")
        XCTAssertEqual(RehearsalIntakeCopy.stepLabel(4), "Step 4 of 4")
        XCTAssertEqual(RehearsalIntakeCopy.titles.count, RehearsalIntakeDraft.stepCount)
    }

    // MARK: - The call

    private let rid = "11111111-1111-4111-8111-111111111111"

    func testARehearsalCallBodyCarriesTheRehearsalAndNoSystemPromptOrCourse() throws {
        let source = CallSource.rehearsal(id: rid, stage: .conversation)
        let body = source.chatBody(
            systemPrompt: "SHOULD NOT TRAVEL", cefrLevel: "A2", course: "en", callId: "call-1",
            messages: [ChatMessage(role: "user", content: "hello")])
        XCTAssertEqual(body["rehearsal"] as? [String: String], ["id": rid, "stage": "conversation"])
        XCTAssertNil(body["systemPrompt"])
        XCTAssertNil(body["course"])
        XCTAssertEqual(body["cefrLevel"] as? String, "A2")
        XCTAssertEqual(body["callId"] as? String, "call-1")
    }

    func testAScenarioCallBodyIsUnchanged() {
        let body = CallSource.scenario.chatBody(
            systemPrompt: "You are Mia.", cefrLevel: nil, course: "en", callId: "c", messages: [])
        XCTAssertEqual(body["systemPrompt"] as? String, "You are Mia.")
        XCTAssertEqual(body["course"] as? String, "en")
        XCTAssertNil(body["rehearsal"])
    }

    func testTheClientSendsTheRehearsalBodyOnTheWire() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = AIConversationClient(baseURL: URL(string: "https://learn.example")!, accessToken: { "tok" }) { request in
            captured.value = request
            let body = try! JSONSerialization.data(withJSONObject: ["content": "Good morning."])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        _ = try await client.chatReply(
            source: .rehearsal(id: rid, stage: .hardMoments), messages: [ChatMessage(role: "user", content: "hi")],
            systemPrompt: "SHOULD NOT TRAVEL", cefrLevel: "B1", course: "en", callId: "call-9")
        let sent = try XCTUnwrap(captured.value?.httpBody)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: sent) as? [String: Any])
        XCTAssertEqual(payload["rehearsal"] as? [String: String], ["id": rid, "stage": "hard_moments"])
        XCTAssertNil(payload["systemPrompt"], "the app never sends prompt text for a rehearsal")
        XCTAssertNil(payload["course"])
    }

    func testTheOpeningLineIsAPromptToTheLearnerAndNeverSentToTheServer() {
        var snapshot = ConversationSnapshot()
        snapshot.appendOpener(RehearsalStage.conversation.opener(course: "en"))
        snapshot.turns.append(ChatMessage(role: "user", content: "Hello"))
        snapshot.turns.append(ChatMessage(role: "assistant", content: "Good morning"))
        let sent = CallSource.rehearsal(id: rid, stage: .conversation).sendableTurns(snapshot)
        XCTAssertEqual(sent.map(\.content), ["Hello", "Good morning"])
        XCTAssertEqual(CallSource.scenario.sendableTurns(snapshot).count, 3, "a scenario keeps its opener, as before")
    }

    func testTheHeaderReadsStageNOfThreeAndTheBarFillsToIt() {
        XCTAssertEqual(RehearsalCallHeader.subline(stage: .conversation), "Alphonso \u{00B7} Stage 2 of 3: The real conversation")
        XCTAssertEqual(RehearsalCallHeader.filledSegments(stage: .warmup), 1)
        XCTAssertEqual(RehearsalCallHeader.filledSegments(stage: .hardMoments), 3)
        XCTAssertEqual(RehearsalEventKind.interview.callTitle, "Interview rehearsal")
    }

    func testEveryStageHasAnOpenerInEveryCourse() {
        for course in ["en", "fr", "es"] {
            for stage in RehearsalStage.allCases { XCTAssertFalse(stage.opener(course: course).isEmpty) }
        }
        XCTAssertEqual(RehearsalStage.warmup.opener(course: "fr"), "Échauffons-nous. Dis bonjour et explique-moi pour quoi tu te prépares.")
    }

    // MARK: - Errors, the client and the paywall

    private func client(
        status: Int, body: [String: Any], capture: TestCapture<URLRequest?>? = nil
    ) -> RehearsalClient {
        RehearsalClient(baseURL: URL(string: "https://learn.example")!, accessToken: { "tok" }) { request in
            capture?.value = request
            let data = try! JSONSerialization.data(withJSONObject: body)
            return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    func testAnswerStatusesMapToTheSameErrorsAsTheWeb() {
        XCTAssertEqual(RehearsalError.from(status: 402, code: nil), .paywall)
        XCTAssertEqual(RehearsalError.from(status: 503, code: nil), .retry)
        XCTAssertEqual(RehearsalError.from(status: 400, code: "blocked_text"), .blockedText)
        XCTAssertEqual(RehearsalError.from(status: 400, code: "invalid_counterpart"), .invalid)
        XCTAssertEqual(RehearsalError.from(status: 409, code: "closed"), .closed)
        XCTAssertEqual(RehearsalError.from(status: 409, code: "active_exists"), .activeExists)
        XCTAssertEqual(RehearsalError.from(status: 404, code: "not_enabled"), .notEnabled)
        XCTAssertEqual(RehearsalError.from(status: 404, code: "not_found"), .notFound)
        XCTAssertEqual(RehearsalError.from(status: 403, code: nil), .consent)
        XCTAssertEqual(RehearsalError.from(status: 500, code: nil), .failed)
    }

    func testCreatingWhenTheFreeRehearsalIsUsedComesBackAsThePaywall() async throws {
        let intake = try RehearsalIntakeDraft(kind: .interview, counterpart: "a manager").validate(course: "en").get()
        let result = await client(status: 402, body: ["error": "paywall"]).create(intake)
        XCTAssertEqual(result, .failure(.paywall))
    }

    func testAFreeRehearsalsRunsBeingUsedUpOnTheChatOpensTheProDoor() throws {
        let body = try JSONSerialization.data(withJSONObject: ["error": "free_runs_used"])
        XCTAssertEqual(TutorError.from(status: 402, body: body), .notEntitled)
    }

    func testTheStateIsFetchedWithTheCourseAndDecoded() async throws {
        let capture = TestCapture<URLRequest?>(nil)
        let json = try XCTUnwrap(try fixture()["state"] as? [String: Any])
        let result = await client(status: 200, body: json, capture: capture).state(course: "fr")
        XCTAssertEqual(try result.get().active?.kind, .interview)
        XCTAssertEqual(capture.value?.httpMethod, "GET")
        XCTAssertEqual(capture.value?.url?.absoluteString, "https://learn.example/api/rehearsal?course=fr")
        XCTAssertEqual(capture.value?.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
    }

    func testAMalformedStateIsAFailureNeverAHalfReadState() async {
        let result = await client(status: 200, body: ["nope": true]).state(course: "en")
        XCTAssertEqual(result, .failure(.failed))
    }

    func testTheEntryTapOpensThePaywallOnlyWhenNotProTheFreeOneIsUsedAndNothingIsActive() throws {
        let used = try state()                     // active present, freeAvailable false
        XCTAssertEqual(RehearsalEntry.decide(state: used, pro: .free), .plan, "an active rehearsal always opens its plan")
        let none = try XCTUnwrap(RehearsalDecoding.state(from: try data("stateEmpty")))
        XCTAssertEqual(RehearsalEntry.decide(state: none, pro: .free), .intake, "the free one is still there")
        var json = try XCTUnwrap(try fixture()["state"] as? [String: Any])
        json["active"] = NSNull()
        json["progress"] = NSNull()
        json["nextStage"] = NSNull()
        json["freeAvailable"] = false
        let spent = try XCTUnwrap(RehearsalDecoding.state(from: try JSONSerialization.data(withJSONObject: json)))
        guard case .paywall(let copy) = RehearsalEntry.decide(state: spent, pro: .free) else {
            return XCTFail("a learner who is not Pro, with the free one used and nothing going, meets the sheet")
        }
        XCTAssertEqual(copy.title, "Rehearsals are part of Pro")
        XCTAssertEqual(copy.subtitle, "You have used your free rehearsal")
        XCTAssertEqual(RehearsalEntry.decide(state: spent, pro: .pro), .intake, "Pro always may")
        XCTAssertEqual(RehearsalEntry.decide(state: spent, pro: .unknown), .unavailable, "an unknown Pro state never shows the sheet")
        XCTAssertEqual(RehearsalEntry.decide(state: none, pro: .unknown), .intake, "the free one is still there")
    }

    func testThePaywallNamesWhatTheLearnerAlreadyDid() throws {
        let copy = RehearsalPaywallCopy.make(history: try state().history)
        XCTAssertEqual(copy.body, "You rehearsed your meeting with Alphonso (AI): all 3 stages, 6 runs, and 4 mistakes sent to Fix before it sticks. A new rehearsal, for a meeting, a landlord or a first day, needs Pro.")
        XCTAssertEqual(copy.primary, "See Pro")
        XCTAssertEqual(copy.secondary, "Not now")
        XCTAssertEqual(RehearsalPaywallCopy.make(history: []).body, "You have used your free rehearsal with Alphonso (AI). A new rehearsal needs Pro.")
    }

    func testThePaywallSourceIsRehearsalEntry() {
        XCTAssertEqual(PaywallSource.rehearsalEntry.rawValue, "rehearsal_entry")
    }

    // MARK: - How did it go?

    func testTheOutcomeTapsSendTheirChoiceAndOnlyMovedSendsADate() async throws {
        for choice in [RehearsalOutcomeChoice.well, .ok, .hard] {
            let body = RehearsalRequests.outcome(id: rid, choice: choice, newDate: "2026-12-04")
            XCTAssertEqual(body["action"] as? String, "outcome")
            XCTAssertEqual(body["choice"] as? String, choice.rawValue)
            XCTAssertNil(body["newDate"], "\(choice) closes the rehearsal and carries no date")
        }
        let moved = RehearsalRequests.outcome(id: rid, choice: .moved, newDate: "2026-12-04")
        XCTAssertEqual(moved["choice"] as? String, "moved")
        XCTAssertEqual(moved["newDate"] as? String, "2026-12-04")
        XCTAssertEqual(moved["id"] as? String, rid)
    }

    func testTheOutcomeGoesToTheServerAsAPostAndAClosedRehearsalIsClosed() async throws {
        let capture = TestCapture<URLRequest?>(nil)
        let active = try XCTUnwrap(try fixture()["state"] as? [String: Any])["active"] as! [String: Any]
        let ok = await client(status: 200, body: ["rehearsal": active], capture: capture).outcome(id: rid, choice: .well)
        XCTAssertEqual(try ok.get().id, rid)
        XCTAssertEqual(capture.value?.httpMethod, "POST")
        let sent = try JSONSerialization.jsonObject(with: try XCTUnwrap(capture.value?.httpBody)) as? [String: Any]
        XCTAssertEqual(sent?["choice"] as? String, "well")
        let closed = await client(status: 409, body: ["error": "closed"]).outcome(id: rid, choice: .ok)
        XCTAssertEqual(closed, .failure(.closed))
    }

    func testTheFourTapsReadAsTheMockSaysAndNoWordsAreStored() {
        XCTAssertEqual(RehearsalOutcomeChoice.allCases.map(\.title), ["Went well", "OK", "It was hard", "It didn\u{2019}t happen / moved"])
        XCTAssertEqual(RehearsalOutcomeChoice.hard.hint, "Alphonso can help you practise those parts")
        XCTAssertEqual(RehearsalOutcomeChoice.moved.hint, "You can set a new date")
        XCTAssertEqual(RehearsalOutcomeChoice.moveButton("2026-12-04"), "Move my rehearsal to Fri 4 Dec")
        XCTAssertEqual(RehearsalOutcomeChoice.footer, "Just a tap. No words are stored. You can delete this rehearsal any time.")
    }

    // MARK: - The plan and the debrief

    func testThePlanRowsAreDoneNextTodo() throws {
        let s = try state()
        let rows = RehearsalPlan.rows(progress: s.progress, nextStage: s.nextStage)
        XCTAssertEqual(rows.map(\.row), [.done, .next, .todo])
        XCTAssertEqual(RehearsalPlan.nextButton(.conversation), "Next: The real conversation")
    }

    private func run(_ stage: String, _ at: String, wentWell: [String] = [], corrections: [String] = []) -> RehearsalRun {
        let json: [String: Any] = ["stage": stage, "finishedAt": at, "momentsShown": [], "wentWell": wentWell, "corrections": corrections]
        return try! JSONDecoder().decode(RehearsalRun.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testTheNextStageIsTheFirstOpenOneThenTheWeakest() {
        XCTAssertEqual(RehearsalPlan.nextStage(runs: []), .warmup)
        XCTAssertEqual(RehearsalPlan.nextStage(runs: [run("warmup", "2026-11-27T10:00:00Z")]), .conversation)
        let all = [run("warmup", "1", corrections: ["a"]), run("conversation", "2", corrections: ["a", "b", "c"]),
                   run("hard_moments", "3", corrections: ["a", "b"])]
        XCTAssertEqual(RehearsalPlan.nextStage(runs: all), .conversation, "the most corrections in its latest run")
        XCTAssertEqual(RehearsalPlan.nextStage(runs: all.reversed()), .conversation, "independent of order")
    }

    func testTheDebriefReadsTheLatestRunOfTheStage() throws {
        let runs = [run("conversation", "2026-11-28T10:00:00Z", wentWell: ["old"], corrections: ["old fix"]),
                    run("conversation", "2026-11-29T10:00:00Z", wentWell: ["You asked a question back"],
                        corrections: ["one", "two", "three"])]
        guard case .debrief(let d) = RehearsalDebrief.make(
            stage: .conversation, kind: .interview, runs: runs, previousFinishedAt: "2026-11-28T10:00:00Z",
            seconds: 540, turns: 14, addedToFix: 2) else { return XCTFail("a newer run is a debrief") }
        XCTAssertEqual(d.heading, "Stage 2 \u{00B7} The real conversation")
        XCTAssertEqual(d.headline, "That was a full interview")
        XCTAssertEqual(RehearsalDebrief.headline(stage: .warmup, kind: .interview), "That was your warm-up")
        XCTAssertEqual(RehearsalDebrief.headline(stage: .hardMoments, kind: .interview), "That was the hard moments")
        XCTAssertEqual(d.stats, "9 minutes \u{00B7} 14 turns")
        XCTAssertEqual(d.wentWell, ["You asked a question back"])
        XCTAssertEqual(d.tryAgain, ["one", "two"], "at most two things to retry")
        XCTAssertEqual(d.fixLine, "2 items. They will come back in Review and in a short lesson.")
    }

    func testTheFixLineIsOnlyThereWhenTheRecapKeptSomething() {
        let runs = [run("warmup", "2026-11-29T10:00:00Z")]
        guard case .debrief(let none) = RehearsalDebrief.make(
            stage: .warmup, kind: .meeting, runs: runs, previousFinishedAt: nil, seconds: 20, turns: 1, addedToFix: 0)
        else { return XCTFail() }
        XCTAssertNil(none.fixLine)
        XCTAssertEqual(none.stats, "1 minute \u{00B7} 1 turn")
        guard case .debrief(let one) = RehearsalDebrief.make(
            stage: .warmup, kind: .meeting, runs: runs, previousFinishedAt: nil, seconds: 120, turns: 6, addedToFix: 1)
        else { return XCTFail() }
        XCTAssertEqual(one.fixLine, "1 item. They will come back in Review and in a short lesson.")
    }

    func testARunThatTheServerDidNotCountIsNoRunNeverAFakeDebrief() {
        let runs = [run("conversation", "2026-11-28T10:00:00Z")]
        XCTAssertEqual(
            RehearsalDebrief.make(stage: .conversation, kind: .interview, runs: runs,
                                  previousFinishedAt: "2026-11-28T10:00:00Z", seconds: 60, turns: 2, addedToFix: 0),
            .noRun)
        XCTAssertEqual(
            RehearsalDebrief.make(stage: .hardMoments, kind: .interview, runs: runs, previousFinishedAt: nil,
                                  seconds: 60, turns: 2, addedToFix: 0),
            .noRun)
    }

    func testNoScoreStarOrReadinessWordingAnywhereInTheCopy() throws {
        var words = [RehearsalPlan.footer, RehearsalDebrief.footer, RehearsalOutcomeChoice.footer, RehearsalIntakeCopy.noNames]
        words += RehearsalPaywallCopy.make(history: try state().history).stays
        for stage in RehearsalStage.allCases { words += [stage.label, stage.blurb] }
        // The footers say "no readiness score" and "not a score" on purpose; nothing else may mention one.
        for line in words where line != RehearsalPlan.footer && line != RehearsalDebrief.footer {
            XCTAssertFalse(Self.mentionsScoring(line), line)
        }
        // The check must still catch the real thing, and not trip on "start".
        XCTAssertTrue(Self.mentionsScoring("You earned 5 stars"))
        XCTAssertTrue(Self.mentionsScoring("Your readiness is high"))
        XCTAssertTrue(Self.mentionsScoring("A score of 80"))
        XCTAssertFalse(Self.mentionsScoring("Start the call"))
    }

    /// Whole words only: "start" and "scoreboard"-style substrings are not scoring language.
    private static func mentionsScoring(_ line: String) -> Bool {
        line.lowercased().range(of: #"\b(stars?|score|readiness)\b"#, options: .regularExpression) != nil
    }

    // MARK: - Dates and the Learn entry

    func testTheDateLineCountsDaysToGo() {
        XCTAssertEqual(RehearsalDates.line(eventDate: "2026-12-01", today: "2026-11-26"), "Tue 1 Dec \u{00B7} 5 days to go")
        XCTAssertEqual(RehearsalDates.line(eventDate: "2026-12-01", today: "2026-12-01"), "Tue 1 Dec \u{00B7} Today")
        XCTAssertEqual(RehearsalDates.line(eventDate: "2026-12-01", today: "2026-11-30"), "Tue 1 Dec \u{00B7} 1 day to go")
        XCTAssertEqual(RehearsalDates.line(eventDate: "2026-12-01", today: "2026-12-02"), "Tue 1 Dec \u{00B7} It was yesterday")
        XCTAssertEqual(RehearsalDates.line(eventDate: "2026-12-01", today: "2026-12-04"), "Tue 1 Dec \u{00B7} 3 days ago")
        XCTAssertEqual(RehearsalDates.long("2026-12-02"), "Wednesday 2 December")
        XCTAssertEqual(RehearsalDates.line(eventDate: nil, today: "2026-11-26"), "Date not set yet")
        XCTAssertTrue(RehearsalDates.isCalendarDate("2024-02-29"))
        XCTAssertFalse(RehearsalDates.isCalendarDate("2026-02-29"))
        XCTAssertFalse(RehearsalDates.isCalendarDate("2026-2-1"))
    }

    func testTheRailCardReadsRehearseThenTheActiveEvent() throws {
        XCTAssertEqual(RehearsalLearnEntry.card(state: nil).title, "Rehearse")
        XCTAssertEqual(RehearsalLearnEntry.card(state: nil).value, "a real talk")
        let card = RehearsalLearnEntry.card(state: try state())
        XCTAssertEqual(card.title, "Rehearsal")
        XCTAssertEqual(card.value, "Job interview \u{00B7} Tue 1 Dec")
        XCTAssertEqual(RehearsalLearnEntry.heroTitle(kind: .interview), "Interview today")
        XCTAssertEqual(RehearsalLearnEntry.heroButton, "Start 2 minutes")
    }

    // MARK: - Quick-starts

    private let presetsJSON: [String: Any] = [
        "presets": [
            [
                "id": "job_interview", "eventKind": "interview", "title": "A job interview",
                "blurb": "Answer the common questions.", "counterpart": "a hiring manager", "futureField": 7,
                "stages": [["key": "warmup", "goal": "Say hello"], ["key": "conversation", "goal": "Talk it through"],
                           ["key": "hard_moments", "goal": "Handle a tough one"]],
                "keyPhrases": [["text": "Nice to meet you", "meaning": "A greeting"]],
            ],
            ["id": "bank_account", "title": "Opening a bank account", "stages": [], "keyPhrases": []],
        ]
    ]

    private let madeRehearsal: [String: Any] = [
        "id": "r1", "course": "en", "eventKind": "interview", "eventDate": "2026-12-01", "counterpart": "a hiring manager",
        "status": "active", "free": true, "createdAt": "2026-11-27T10:00:00Z",
    ]

    func testThePresetListDecodesInServerOrderAndIgnoresUnknownFields() throws {
        let list = try XCTUnwrap(RehearsalDecoding.presets(from: try JSONSerialization.data(withJSONObject: presetsJSON)))
        XCTAssertEqual(list.map(\.id), ["job_interview", "bank_account"])
        XCTAssertEqual(list[0].title, "A job interview")
        XCTAssertEqual(list[0].counterpartLine, "Talking to: a hiring manager")
        XCTAssertEqual(list[0].stages.map(\.stage), [.warmup, .conversation, .hardMoments])
        XCTAssertEqual(list[0].stages[2].goal, "Handle a tough one")
        XCTAssertEqual(list[0].keyPhrases.first?.meaning, "A greeting")
        XCTAssertEqual(list[1].blurb, "", "a missing blurb reads as empty, not a failed list")
    }

    func testAPresetThatCannotBeReadIsDroppedAndTheRestSurvive() throws {
        let body: [String: Any] = ["presets": [["title": "No id"], ["id": "first_day", "title": "First day"]]]
        let list = try XCTUnwrap(RehearsalDecoding.presets(from: try JSONSerialization.data(withJSONObject: body)))
        XCTAssertEqual(list.map(\.id), ["first_day"])
    }

    func testAnAnswerWithNoPresetListIsNil() throws {
        XCTAssertNil(RehearsalDecoding.presets(from: try JSONSerialization.data(withJSONObject: ["error": "x"])))
        XCTAssertNil(RehearsalDecoding.presets(from: Data("nope".utf8)))
    }

    func testTheQuickStartCreateBodyCarriesThePresetAndOnlyAnAddedDate() {
        let none = RehearsalRequests.create(course: "fr", preset: "job_interview", eventDate: nil)
        XCTAssertEqual(none["action"] as? String, "create")
        XCTAssertEqual(none["course"] as? String, "fr")
        XCTAssertEqual(none["preset"] as? String, "job_interview")
        XCTAssertTrue(none["eventDate"] is NSNull, "no date added is a null eventDate, as the shared fixture has it")
        XCTAssertEqual(none.count, 4)
        XCTAssertNil(none["counterpart"], "no intake text travels with a quick-start")
        let dated = RehearsalRequests.create(course: "en", preset: "first_day", eventDate: "2026-12-01")
        XCTAssertEqual(dated["eventDate"] as? String, "2026-12-01")
    }

    func testTheClientFetchesPresetsForTheCourseAndSendsAQuickStartCreate() async throws {
        let get = TestCapture<URLRequest?>(nil)
        let result = await client(status: 200, body: presetsJSON, capture: get).presets(course: "es")
        let list = try result.get()
        XCTAssertEqual(list.count, 2)
        XCTAssertEqual(get.value?.httpMethod, "GET")
        XCTAssertEqual(get.value?.url?.path, "/api/rehearsal-presets")
        XCTAssertEqual(get.value?.url?.query, "course=es")

        let post = TestCapture<URLRequest?>(nil)
        let made = await client(status: 200, body: ["rehearsal": madeRehearsal], capture: post)
            .create(course: "en", preset: "job_interview", eventDate: "2026-12-01")
        XCTAssertNotNil(try? made.get())
        let sent = try XCTUnwrap(post.value?.httpBody)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: sent) as? [String: Any])
        XCTAssertEqual(payload["preset"] as? String, "job_interview")
        XCTAssertEqual(payload["eventDate"] as? String, "2026-12-01")
        XCTAssertEqual(post.value?.url?.path, "/api/rehearsal")
    }

    func testAnEmptyPresetListIsAFailureSoTheScreenFallsBackToSomethingElse() async {
        let result = await client(status: 200, body: ["presets": []]).presets(course: "en")
        XCTAssertEqual(result, .failure(.failed))
    }

    func testPresetErrorsMapLikeTheCreateEverywhereElse() async throws {
        XCTAssertEqual(RehearsalError.from(status: 400, code: "invalid_preset"), .invalidPreset)
        XCTAssertEqual(RehearsalError.from(status: 400, code: "invalid_counterpart"), .invalid)
        let r1 = await client(status: 404, body: ["error": "not_enabled"]).presets(course: "en")
        XCTAssertEqual(r1, .failure(.notEnabled))
        let r2 = await client(status: 402, body: ["error": "paywall"]).create(course: "en", preset: "bank_account", eventDate: nil)
        XCTAssertEqual(r2, .failure(.paywall))
        let r3 = await client(status: 409, body: ["error": "active_exists"]).create(course: "en", preset: "bank_account", eventDate: nil)
        XCTAssertEqual(r3, .failure(.activeExists))
        let r4 = await client(status: 400, body: ["error": "invalid_preset"]).create(course: "en", preset: "nope", eventDate: nil)
        XCTAssertEqual(r4, .failure(.invalidPreset))
        XCTAssertFalse(RehearsalError.invalidPreset.userMessage.isEmpty)
    }

    // MARK: - Quick-starts against the shared fixture

    func testTheSharedPresetsAnswerDecodesToTheEightCards() throws {
        let response = try XCTUnwrap(try fixture()["presets"] as? [String: Any])
        let body = try JSONSerialization.data(withJSONObject: try XCTUnwrap(response["response"]))
        let list = try XCTUnwrap(RehearsalDecoding.presets(from: body))
        XCTAssertEqual(list.map(\.id), ["job_interview", "talk_to_manager", "doctor_appointment", "apartment_landlord",
                                         "bank_account", "parent_teacher", "first_day", "customer_service_call"])
        for preset in list {
            XCTAssertEqual(preset.stages.compactMap(\.stage), RehearsalStage.allCases, preset.id)
            XCTAssertFalse(preset.title.isEmpty)
            XCTAssertFalse(preset.counterpart.isEmpty)
            XCTAssertFalse(preset.keyPhrases.isEmpty)
        }
    }

    func testTheSharedCreateFromPresetAndAddDateBodiesMatchWhatTheAppSends() throws {
        let f = try fixture()
        let create = try XCTUnwrap(f["createFromPreset"] as? [String: Any])
        let sent = RehearsalRequests.create(course: "en", preset: "doctor_appointment", eventDate: nil)
        XCTAssertEqual(NSDictionary(dictionary: sent), NSDictionary(dictionary: create))
        let add = try XCTUnwrap(f["addDate"] as? [String: Any])
        let id = try XCTUnwrap(add["id"] as? String)
        let adjust = RehearsalRequests.addDate(id: id, eventDate: "2026-12-04")
        XCTAssertEqual(NSDictionary(dictionary: adjust), NSDictionary(dictionary: add))
    }

    // MARK: - Hector and hard mode

    private func chatBody(_ source: CallSource) -> [String: Any] {
        source.chatBody(systemPrompt: nil, cefrLevel: nil, course: nil, callId: "c", messages: [])
    }

    private func rehearsalPart(_ source: CallSource) throws -> NSDictionary {
        NSDictionary(dictionary: try XCTUnwrap(chatBody(source)["rehearsal"] as? [String: Any]))
    }

    func testAHectorBodyMatchesTheSharedFixtureOnEveryTurn() throws {
        let f = try fixture()
        let hector = try XCTUnwrap(f["chatBodyHector"] as? [String: Any])["rehearsal"] as! [String: Any]
        let hard = try XCTUnwrap(f["chatBodyHard"] as? [String: Any])["rehearsal"] as! [String: Any]
        let one = CallSource.rehearsal(id: rid, stage: .conversation, persona: .hector)
        let two = CallSource.rehearsal(id: rid, stage: .hardMoments, persona: .hector, hardMode: true)
        // The same source builds the same fields on turn 1 and turn 5: nothing about the call changes between turns.
        for _ in 0..<5 {
            XCTAssertEqual(try rehearsalPart(one), NSDictionary(dictionary: hector))
            XCTAssertEqual(try rehearsalPart(two), NSDictionary(dictionary: hard))
        }
    }

    func testAnAlphonsoBodyIsExactlyTheOldOne() throws {
        let f = try fixture()
        let expected = try XCTUnwrap(f["chatBody"] as? [String: Any])["rehearsal"] as! [String: Any]
        XCTAssertEqual(try rehearsalPart(.rehearsal(id: rid, stage: .conversation)), NSDictionary(dictionary: expected))
        // Even a stray hard-mode flag never travels for Alphonso.
        let stray = try rehearsalPart(.rehearsal(id: rid, stage: .hardMoments, persona: .alphonso, hardMode: true))
        XCTAssertNil(stray["persona"])
        XCTAssertNil(stray["hardMode"])
    }

    func testHardModeIsNeverSentOutsideTheLastStage() throws {
        let part = try rehearsalPart(.rehearsal(id: rid, stage: .warmup, persona: .hector, hardMode: true))
        XCTAssertEqual(part["persona"] as? String, "hector")
        XCTAssertNil(part["hardMode"], "the server answers 400 invalid_mode; the app does not ask for it")
    }

    func testTheChatErrorsMapToTheirOwnPaywallsAndMessages() throws {
        let errors = try XCTUnwrap(try fixture()["chatErrors"] as? [[String: Any]])
        XCTAssertEqual(errors.count, 4)
        for entry in errors {
            let status = try XCTUnwrap(entry["status"] as? Int)
            let body = try JSONSerialization.data(withJSONObject: try XCTUnwrap(entry["body"]))
            let error = TutorError.from(status: status, body: body)
            switch entry["means"] as? String {
            case "paywall": XCTAssertEqual(error, .proRequired)
            case "free_runs_used": XCTAssertEqual(error, .notEntitled)
            case "invalid": XCTAssertEqual(error, .server(message: nil), "the generic message")
            case "retry": XCTAssertEqual(error, .server(message: nil), "the existing retry: the turn is spoken again")
            default: XCTFail("a chat error the app does not know: \(entry)")
            }
        }
        XCTAssertNotEqual(TutorError.proRequired.userMessage(), TutorError.notEntitled.userMessage())
        XCTAssertTrue(TutorError.proRequired.userMessage().contains("Hector"))
    }

    func testTheStateReadsHectorAvailableAsTrueFalseAndNull() throws {
        XCTAssertEqual(try state().hectorAvailable, true)
        let empty = try XCTUnwrap(RehearsalDecoding.state(from: try data("stateEmpty")))
        XCTAssertNil(empty.hectorAvailable, "null: let them try")
        var json = try XCTUnwrap(try fixture()["state"] as? [String: Any])
        json["hectorAvailable"] = false
        let notPro = try XCTUnwrap(RehearsalDecoding.state(from: try JSONSerialization.data(withJSONObject: json)))
        XCTAssertEqual(notPro.hectorAvailable, false)
        json["hectorAvailable"] = "yes"
        let odd = try XCTUnwrap(RehearsalDecoding.state(from: try JSONSerialization.data(withJSONObject: json)))
        XCTAssertNil(odd.hectorAvailable, "a wrong type is unknown, never Pro")
        json.removeValue(forKey: "hectorAvailable")
        json.removeValue(forKey: "hardModeDone")
        let older = try XCTUnwrap(RehearsalDecoding.state(from: try JSONSerialization.data(withJSONObject: json)))
        XCTAssertNil(older.hectorAvailable)
        XCTAssertFalse(older.hardModeDone)
    }

    func testRunsReadWhoPlayedThemAndWhetherItWasHard() throws {
        let run = try XCTUnwrap(try state().runs.first)
        XCTAssertEqual(run.rehearsalPersona, .alphonso)
        XCTAssertFalse(run.isHardMode)
        var json = try XCTUnwrap(try fixture()["state"] as? [String: Any])
        var runs = try XCTUnwrap(json["runs"] as? [[String: Any]])
        runs[0]["persona"] = "hector"
        runs[0]["hardMode"] = true
        json["runs"] = runs
        json["hardModeDone"] = true
        let s = try XCTUnwrap(RehearsalDecoding.state(from: try JSONSerialization.data(withJSONObject: json)))
        XCTAssertEqual(s.runs.first?.rehearsalPersona, .hector)
        XCTAssertEqual(s.runs.first?.isHardMode, true)
        XCTAssertTrue(s.hardModeDone)
        XCTAssertTrue(RehearsalPlan.showsHardModeDone(stage: .hardMoments, state: s))
        XCTAssertFalse(RehearsalPlan.showsHardModeDone(stage: .warmup, state: s), "only under the last stage")
        XCTAssertFalse(RehearsalPlan.showsHardModeDone(stage: .hardMoments, state: try state()))
    }

    private func run(_ stage: String, at: String, corrections: [String] = [], hard: Bool = false) throws -> RehearsalRun {
        let json: [String: Any] = [
            "stage": stage, "finishedAt": at, "momentsShown": [], "wentWell": [], "corrections": corrections,
            "persona": hard ? "hector" : "alphonso", "hardMode": hard,
        ]
        return try JSONDecoder().decode(RehearsalRun.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testAHardModeRunNeverMarksAStageDoneOrReplacesItsRun() throws {
        let runs = [
            try run("warmup", at: "2026-11-27T10:00:00Z"),
            try run("conversation", at: "2026-11-27T11:00:00Z"),
            try run("hard_moments", at: "2026-11-27T12:00:00Z", corrections: ["a", "b", "c"], hard: true),
        ]
        XCTAssertEqual(RehearsalPlan.nextStage(runs: runs), .hardMoments, "the hard-mode run did not finish the stage")
        XCTAssertNil(RehearsalPlan.latestRun(runs, stage: .hardMoments))
        XCTAssertEqual(RehearsalPlan.latestRun(runs, stage: .hardMoments, hardMode: true)?.corrections.count, 3)
        let normal = try run("hard_moments", at: "2026-11-27T09:00:00Z", corrections: ["x"])
        XCTAssertEqual(RehearsalPlan.latestRun(runs + [normal], stage: .hardMoments)?.corrections, ["x"])
    }

    func testTheDebriefOfAHardModeCallReadsTheHardRun() throws {
        let runs = [
            try run("hard_moments", at: "2026-11-27T09:00:00Z", corrections: ["old"]),
            try run("hard_moments", at: "2026-11-27T12:00:00Z", corrections: ["new"], hard: true),
        ]
        let hard = RehearsalDebrief.make(
            stage: .hardMoments, kind: .interview, runs: runs, previousFinishedAt: nil, seconds: 300, turns: 6,
            addedToFix: 0, hardMode: true)
        guard case .debrief(let d) = hard else { return XCTFail("\(hard)") }
        XCTAssertEqual(d.tryAgain, ["new"])
        // A call that made no hard-mode run is not given an older normal run's debrief.
        let none = RehearsalDebrief.make(
            stage: .hardMoments, kind: .interview, runs: [runs[0]], previousFinishedAt: nil, seconds: 60, turns: 2,
            addedToFix: 0, hardMode: true)
        XCTAssertEqual(none, .noRun)
    }

    func testThePartnerSheetsRulesFollowHectorAvailable() {
        // true: Pro. No badge, Hector starts, hard mode on the last stage.
        XCTAssertFalse(RehearsalPartner.showsProBadge(hectorAvailable: true))
        XCTAssertEqual(RehearsalPartner.hectorDoor(hectorAvailable: true), .start)
        XCTAssertTrue(RehearsalPartner.offersHardMode(stage: .hardMoments, hectorAvailable: true))
        // false: not Pro. Badge, the paywall, no hard mode.
        XCTAssertTrue(RehearsalPartner.showsProBadge(hectorAvailable: false))
        XCTAssertEqual(RehearsalPartner.hectorDoor(hectorAvailable: false), .paywall)
        XCTAssertFalse(RehearsalPartner.offersHardMode(stage: .hardMoments, hectorAvailable: false))
        // null: let them try; the server decides.
        XCTAssertFalse(RehearsalPartner.showsProBadge(hectorAvailable: nil))
        XCTAssertEqual(RehearsalPartner.hectorDoor(hectorAvailable: nil), .start)
        XCTAssertTrue(RehearsalPartner.offersHardMode(stage: .hardMoments, hectorAvailable: nil))
        // Hard mode is the last stage only.
        XCTAssertFalse(RehearsalPartner.offersHardMode(stage: .warmup, hectorAvailable: true))
        XCTAssertFalse(RehearsalPartner.offersHardMode(stage: .conversation, hectorAvailable: true))
    }

    func testTheChosenSourceDropsHardModeWhereItIsNotOffered() throws {
        let a = RehearsalPartner.source(rehearsalId: rid, stage: .hardMoments, persona: .alphonso, hardMode: true)
        XCTAssertEqual(a, .rehearsal(id: rid, stage: .hardMoments, persona: .alphonso, hardMode: false))
        let w = RehearsalPartner.source(rehearsalId: rid, stage: .warmup, persona: .hector, hardMode: true)
        XCTAssertEqual(w, .rehearsal(id: rid, stage: .warmup, persona: .hector, hardMode: false))
        let h = RehearsalPartner.source(rehearsalId: rid, stage: .hardMoments, persona: .hector, hardMode: true)
        XCTAssertEqual(h, .rehearsal(id: rid, stage: .hardMoments, persona: .hector, hardMode: true))
    }

    func testThePartnerSheetsWordsAndVoiceOverLabels() {
        XCTAssertEqual(RehearsalPartner.hectorButton(hectorAvailable: false, hardMode: true), "Start with Hector (Pro)")
        XCTAssertEqual(RehearsalPartner.hectorButton(hectorAvailable: true, hardMode: true), "Start hard mode with Hector")
        XCTAssertEqual(RehearsalPartner.hectorButton(hectorAvailable: nil, hardMode: false), "Start with Hector")
        XCTAssertTrue(RehearsalPartner.hectorAccessibilityLabel(hectorAvailable: false, hardMode: false).contains("Needs Alphonso Pro"))
        XCTAssertFalse(RehearsalPartner.hectorAccessibilityLabel(hectorAvailable: true, hardMode: false).contains("Pro"))
        XCTAssertTrue(RehearsalPartner.hectorAccessibilityLabel(hectorAvailable: true, hardMode: false).contains("AI"))
    }

    func testAHectorCallSpeaksWithHisVoiceAndSaysWhoIsOnTheLine() {
        XCTAssertEqual(RehearsalPersona.hector.voiceCharacter, .hector)
        XCTAssertEqual(RehearsalPersona.alphonso.voiceCharacter, .alphonso)
        XCTAssertEqual(RehearsalCallHeader.subline(stage: .conversation), "Alphonso \u{00B7} Stage 2 of 3: The real conversation")
        XCTAssertEqual(
            RehearsalCallHeader.subline(stage: .hardMoments, persona: .hector, hardMode: true),
            "Hector \u{00B7} Stage 3 of 3: The hard moments \u{00B7} Hard mode")
    }
}
