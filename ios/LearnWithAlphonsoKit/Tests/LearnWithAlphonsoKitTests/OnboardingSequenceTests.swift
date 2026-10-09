import XCTest
@testable import LearnWithAlphonsoKit

final class OnboardingSequenceTests: XCTestCase {
    func testTheNamePromptComesBeforePlacement() {
        XCTAssertEqual(OnboardingSequence.next(nameConfirmed: false, placementTaken: false, done: []), .displayName)
        XCTAssertEqual(OnboardingSequence.next(nameConfirmed: false, placementTaken: false, done: [.displayName]), .placement)
        XCTAssertNil(OnboardingSequence.next(nameConfirmed: false, placementTaken: false, done: [.displayName, .placement]))
    }

    func testAFailedCheckSkipsThatStepAndNeverBlocks() {
        XCTAssertEqual(OnboardingSequence.next(nameConfirmed: nil, placementTaken: false, done: []), .placement)
        XCTAssertNil(OnboardingSequence.next(nameConfirmed: nil, placementTaken: nil, done: []))
        XCTAssertEqual(OnboardingSequence.next(nameConfirmed: false, placementTaken: nil, done: []), .displayName)
    }

    func testAReturningLearnerSeesNothing() {
        XCTAssertNil(OnboardingSequence.next(nameConfirmed: true, placementTaken: true, done: []))
        XCTAssertEqual(OnboardingSequence.next(nameConfirmed: true, placementTaken: false, done: []), .placement)
    }

    private let nameState = DisplayNameOnboarding(prefill: "Sam", currentName: "Learner-4F2A")

    func testTheNameStepWithItsDataIsAScreenThatCarriesThatData() {
        XCTAssertEqual(OnboardingSequence.presentation(for: .displayName, nameOnboarding: nameState), .displayName(nameState))
        XCTAssertEqual(OnboardingSequence.presentation(for: .placement, nameOnboarding: nil), .placement)
        XCTAssertEqual(OnboardingSequence.presentation(for: .placement, nameOnboarding: nameState), .placement)
    }

    func testTheNameStepWithoutItsDataIsSkippedNotShownEmpty() {
        XCTAssertNil(OnboardingSequence.presentation(for: .displayName, nameOnboarding: nil))
    }

    func testAdvanceShowsTheNamePromptWithItsStateFirst() {
        let r = OnboardingSequence.advance(nameConfirmed: false, placementTaken: false, done: [], nameOnboarding: nameState)
        XCTAssertEqual(r.presentation, .displayName(nameState))
        XCTAssertEqual(r.done, [])
    }

    func testAdvanceSkipsAnUnshowableNameStepToPlacement() {
        let r = OnboardingSequence.advance(nameConfirmed: false, placementTaken: false, done: [], nameOnboarding: nil)
        XCTAssertEqual(r.presentation, .placement)
        XCTAssertEqual(r.done, [.displayName])
    }

    func testAdvanceSkipsAnUnshowableNameStepToTheAppWhenNothingElseIsLeft() {
        let r = OnboardingSequence.advance(nameConfirmed: false, placementTaken: true, done: [], nameOnboarding: nil)
        XCTAssertNil(r.presentation)
        XCTAssertEqual(r.done, [.displayName])
    }

    func testAdvanceNeverRepeatsAFinishedStep() {
        let r = OnboardingSequence.advance(nameConfirmed: false, placementTaken: false, done: [.displayName], nameOnboarding: nameState)
        XCTAssertEqual(r.presentation, .placement)
    }
}
