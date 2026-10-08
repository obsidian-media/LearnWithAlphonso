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
}
