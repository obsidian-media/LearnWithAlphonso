import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Reads the SAME fixture the web pins (Fixtures/name-onboarding.fixtures.json is a byte-for-byte copy of
/// src/lib/name-onboarding.fixtures.json, guarded by src/lib/name-onboarding-native-fixtures.test.ts).
final class DisplayNameOnboardingTests: XCTestCase {
    private func fixtures() throws -> [String: Any] {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "name-onboarding.fixtures", withExtension: "json", subdirectory: "Fixtures"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    private func string(_ any: Any?) -> String? { any as? String }

    func testCopyIsWordForWordTheSharedFixture() throws {
        let copy = try XCTUnwrap(fixtures()["copy"] as? [String: String])
        XCTAssertEqual(NameOnboardingCopy.title, copy["title"])
        XCTAssertEqual(NameOnboardingCopy.publicNote, copy["publicNote"])
        XCTAssertEqual(NameOnboardingCopy.fieldLabel, copy["fieldLabel"])
        XCTAssertEqual(NameOnboardingCopy.save, copy["save"])
        XCTAssertEqual(NameOnboardingCopy.skip, copy["skip"])
        XCTAssertEqual(NameOnboardingCopy.checking, copy["checking"])
        XCTAssertEqual(NameOnboardingCopy.looksGood, copy["looksGood"])
        XCTAssertEqual(NameOnboardingCopy.skipNote(currentName: "Learner-0B1C"),
                       copy["skipNoteHandle"]?.replacingOccurrences(of: "{name}", with: "Learner-0B1C"))
        XCTAssertEqual(NameOnboardingCopy.skipNote(currentName: "Jenny Coon"), copy["skipNoteGeneric"])
        for value in copy.values { XCTAssertFalse(value.contains("--"), value) }
    }

    func testLocalLengthRuleMatchesTheFixture() throws {
        for row in try XCTUnwrap(fixtures()["localProblem"] as? [[String: Any]]) {
            XCTAssertEqual(DisplayNameOnboarding.localProblem(row["input"] as! String), string(row["expect"]), row["id"] as! String)
        }
        for row in try XCTUnwrap(fixtures()["normalized"] as? [[String: Any]]) {
            XCTAssertEqual(DisplayNameOnboarding.normalized(row["input"] as! String), row["expect"] as? String, row["id"] as! String)
        }
    }

    func testPrefillOrderMatchesTheFixture() throws {
        for row in try XCTUnwrap(fixtures()["prefill"] as? [[String: Any]]) {
            let names = AuthUserNames(givenName: string(row["givenName"]), fullName: string(row["fullName"]), name: string(row["name"]))
            let got = DisplayNameOnboarding.prefill(appleGivenName: string(row["appleGivenName"]), names: names,
                                                    currentName: row["currentName"] as! String)
            XCTAssertEqual(got, row["expect"] as? String, row["id"] as! String)
        }
    }

    func testThePromptIsNeededOnlyWhileUnconfirmed() {
        XCTAssertTrue(DisplayNameOnboarding.needsPrompt(nameConfirmedAt: nil))
        XCTAssertFalse(DisplayNameOnboarding.needsPrompt(nameConfirmedAt: Date()))
    }

    func testAGeneratedHandlePrefillIsAHintNotText() {
        let state = DisplayNameOnboarding(prefill: "Learner-3807", currentName: "Learner-3807")
        XCTAssertEqual(state.name, "", "typing must not append to the generated handle")
        XCTAssertEqual(state.fieldPlaceholder, "Learner-3807")
        XCTAssertEqual(state.check, .idle)
        XCTAssertNil(state.pendingCheck)
        XCTAssertNil(state.message, "no error is shown before the learner has typed anything")
        XCTAssertFalse(state.canSave)
        XCTAssertTrue(state.canSkip)
    }

    func testAnEmptyFieldNeverShowsAnErrorAndCannotBeSaved() {
        var state = DisplayNameOnboarding(prefill: "Learner-3807", currentName: "Learner-3807")
        // SwiftUI can set a text field to the value it already has, e.g. when it gains focus.
        XCTAssertNil(state.edit(""))
        XCTAssertEqual(state.check, .idle)
        XCTAssertNil(state.message)
        XCTAssertFalse(state.isProblem)
        XCTAssertFalse(state.canSave)
        XCTAssertNil(state.edit("   "))
        XCTAssertEqual(state.check, .idle)
    }

    func testClearingARealPrefillGoesBackToIdleNotToAnError() {
        var state = DisplayNameOnboarding(prefill: "Ana", currentName: "Learner-4F2A")
        XCTAssertNil(state.edit(""))
        XCTAssertEqual(state.check, .idle)
        XCTAssertNil(state.message)
        XCTAssertFalse(state.canSave)
    }

    func testTypingIntoTheEmptyFieldStartsACheckOfJustWhatWasTyped() throws {
        var state = DisplayNameOnboarding(prefill: "Learner-3807", currentName: "Learner-3807")
        let generation = try XCTUnwrap(state.edit("QA Delta"))
        XCTAssertEqual(state.name, "QA Delta")
        state.applyCheck(problem: nil, generation: generation)
        XCTAssertTrue(state.canSave)
    }

    func testARealPrefillStaysAsText() {
        let state = DisplayNameOnboarding(prefill: "Ana", currentName: "Learner-4F2A")
        XCTAssertEqual(state.name, "Ana")
        XCTAssertEqual(state.fieldPlaceholder, "Learner-4F2A")
        XCTAssertEqual(state.pendingCheck, 1)
    }

    func testThePlaceholderFallsBackToTheLabelWhenTheCurrentNameIsNotAHandle() {
        let state = DisplayNameOnboarding(prefill: "Old Name", currentName: "Old Name")
        XCTAssertEqual(state.fieldPlaceholder, NameOnboardingCopy.fieldLabel)
    }

    func testANewStateChecksItsPrefillAtOnce() {
        let state = DisplayNameOnboarding(prefill: "Ana", currentName: "Learner-4F2A")
        XCTAssertEqual(state.pendingCheck, 1)
        XCTAssertFalse(state.canSave, "nothing is saved before the server has looked at it")
    }

    func testTheLengthRuleDecidesLocallyWithoutARequest() {
        var state = DisplayNameOnboarding(prefill: "Ana", currentName: "Learner-4F2A")
        XCTAssertNil(state.edit("A"))
        XCTAssertEqual(state.check, .problem(code: "invalid-name"))
        XCTAssertEqual(state.message, SocialReasonCopy.message(for: "invalid-name"))
        XCTAssertFalse(state.canSave)
    }

    func testAnAcceptedNameCanBeSaved() throws {
        var state = DisplayNameOnboarding(prefill: "Ana", currentName: "Learner-4F2A")
        let generation = try XCTUnwrap(state.edit("Furaha"))
        state.applyCheck(problem: nil, generation: generation)
        XCTAssertEqual(state.check, .ok)
        XCTAssertEqual(state.message, NameOnboardingCopy.looksGood)
        XCTAssertTrue(state.canSave)
    }

    func testABlockedNameShowsTheSharedCopy() throws {
        var state = DisplayNameOnboarding(prefill: "Ana", currentName: "Learner-4F2A")
        let generation = try XCTUnwrap(state.edit("Shithead"))
        state.applyCheck(problem: "blocked-content", generation: generation)
        XCTAssertEqual(state.message, Copy.nameNotAllowed)
        XCTAssertTrue(state.isProblem)
        XCTAssertFalse(state.canSave)
    }

    func testAStaleCheckResultIsIgnored() throws {
        var state = DisplayNameOnboarding(prefill: "Ana", currentName: "Learner-4F2A")
        let old = try XCTUnwrap(state.edit("Fu"))
        let current = try XCTUnwrap(state.edit("Furaha"))
        state.applyCheck(problem: "blocked-content", generation: old)
        XCTAssertEqual(state.check, .checking(generation: current))
        state.applyCheck(problem: nil, generation: current)
        XCTAssertEqual(state.check, .ok)
    }

    func testAnUnreachableFilterStillAllowsSavingBecauseTheServerChecksAgain() throws {
        var state = DisplayNameOnboarding(prefill: "Ana", currentName: "Learner-4F2A")
        let generation = try XCTUnwrap(state.edit("Furaha"))
        state.checkFailed(generation: generation)
        XCTAssertEqual(state.check, .unverified)
        XCTAssertTrue(state.canSave)
    }

    func testASaveRefusedByTheServerBecomesAProblem() {
        var state = DisplayNameOnboarding(prefill: "Ana", currentName: "Learner-4F2A")
        state.applyCheck(problem: nil, generation: 1)
        XCTAssertTrue(state.beginSubmit())
        XCTAssertFalse(state.beginSubmit(), "a double tap must not submit twice")
        state.submitFailed(ProgressSyncError.server(status: 400, message: "blocked-content"))
        XCTAssertFalse(state.isSubmitting)
        XCTAssertEqual(state.check, .problem(code: "blocked-content"))
        XCTAssertEqual(state.message, Copy.nameNotAllowed)
    }

    func testASaveThatCouldNotConnectSaysSo() {
        var state = DisplayNameOnboarding(prefill: "Ana", currentName: "Learner-4F2A")
        state.applyCheck(problem: nil, generation: 1)
        _ = state.beginSubmit()
        state.submitFailed(URLError(.timedOut))
        XCTAssertEqual(state.message, Copy.connectionFailure)
        XCTAssertTrue(state.canSave, "the learner can try again")
    }

    func testASkipThatFailsStillLetsTheLearnerContinue() {
        // A name prompt that cannot be left is a trap (App Review 5.1.1): whatever the server answers to Skip,
        // the prompt closes. Nothing is stamped on failure, so it returns next launch.
        XCTAssertEqual(DisplayNameOnboarding.resolveSkip(.success("Learner-9C0D")), .saved("Learner-9C0D"))
        XCTAssertEqual(DisplayNameOnboarding.resolveSkip(.failure(URLError(.notConnectedToInternet))), .deferred)
        XCTAssertEqual(DisplayNameOnboarding.resolveSkip(.failure(ProgressSyncError.server(status: 500, message: nil))), .deferred)
        XCTAssertTrue(DisplayNameOnboarding.resolveSkip(.failure(URLError(.timedOut))).closesPrompt)
        XCTAssertTrue(DisplayNameOnboarding.resolveSkip(.success("Learner-9C0D")).closesPrompt)
    }

    func testHandleShape() {
        XCTAssertTrue(DisplayNameOnboarding.isLearnerHandle("Learner-4F2A"))
        XCTAssertFalse(DisplayNameOnboarding.isLearnerHandle("Learner-4f2a"))
        XCTAssertFalse(DisplayNameOnboarding.isLearnerHandle("Learner-4F2A "))
    }
}
