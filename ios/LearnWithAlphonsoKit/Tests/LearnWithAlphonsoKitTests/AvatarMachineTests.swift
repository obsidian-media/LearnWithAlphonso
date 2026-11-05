import XCTest
@testable import LearnWithAlphonsoKit

final class AvatarMachineTests: XCTestCase {
    private let plan = AvatarLipSync.plan(text: "ab cd", course: .english, duration: 5)

    func testPhasesMapToModes() {
        var m = AvatarMachine()
        XCTAssertEqual(m.mode, .idle)
        m.update(phase: .recording(generation: 1), now: 0)
        XCTAssertEqual(m.mode, .listening)
        m.update(phase: .transcribing(generation: 1), now: 1)
        XCTAssertEqual(m.mode, .thinking)
        m.update(phase: .thinking(generation: 1), now: 2)
        XCTAssertEqual(m.mode, .thinking)
        m.update(phase: .speaking(generation: 1), now: 3)
        XCTAssertEqual(m.mode, .speaking)
        m.update(phase: .idle, now: 9)
        XCTAssertEqual(m.mode, .idle)
    }

    func testThinkingLowersTheBrowsAndKeepsTheMouthShut() {
        var m = AvatarMachine()
        m.update(phase: .thinking(generation: 1), now: 0)
        XCTAssertEqual(m.pose(now: 0.1, speech: nil), AvatarPose(mouth: .closed, brows: .lowered))
    }

    func testSpeakingFollowsThePlanAndStaysShutWithoutPlayback() {
        var m = AvatarMachine()
        m.update(phase: .speaking(generation: 1), now: 0)
        XCTAssertEqual(m.pose(now: 0.1, speech: AvatarSpeechPosition(plan: plan, time: 0.5)).mouth, .ah)
        XCTAssertEqual(m.pose(now: 0.1, speech: AvatarSpeechPosition(plan: plan, time: 3.5)).mouth, .half)
        XCTAssertEqual(m.pose(now: 0.1, speech: nil).mouth, .closed)
    }

    func testListeningNeverMovesTheMouthEvenIfAPlanIsStillAround() {
        var m = AvatarMachine()
        m.update(phase: .recording(generation: 2), now: 0)
        XCTAssertEqual(m.pose(now: 0.1, speech: AvatarSpeechPosition(plan: plan, time: 0.5)).mouth, .closed)
    }

    func testPressingTalkWhileHeSpeaksGoesStraightToListeningWithAClosedMouth() {
        var m = AvatarMachine()
        m.update(phase: .speaking(generation: 1), now: 0)
        XCTAssertEqual(m.mode, .speaking)
        m.update(phase: .recording(generation: 2), now: 1)
        XCTAssertEqual(m.mode, .listening)
        XCTAssertEqual(m.pose(now: 1.0, speech: AvatarSpeechPosition(plan: plan, time: 0.5)).mouth, .closed)
    }

    func testLoudMomentsRaiseTheBrowsBrieflyWhileListening() {
        var m = AvatarMachine()
        m.update(phase: .recording(generation: 1), now: 0)
        XCTAssertEqual(m.pose(now: 0.1, speech: nil).brows, .neutral)
        m.heard(levelDBFS: -10, now: 1.0)
        XCTAssertEqual(m.pose(now: 1.1, speech: nil).brows, .raised)
        XCTAssertEqual(m.pose(now: 1.0 + AvatarMachine.loudBrowHold + 0.01, speech: nil).brows, .neutral)
    }

    func testQuietSoundDoesNotRaiseTheBrowsAndLoudSoundOutsideListeningIsIgnored() {
        var m = AvatarMachine()
        m.update(phase: .recording(generation: 1), now: 0)
        m.heard(levelDBFS: -40, now: 1)
        XCTAssertEqual(m.pose(now: 1.05, speech: nil).brows, .neutral)
        var idle = AvatarMachine()
        idle.heard(levelDBFS: -5, now: 1)
        XCTAssertEqual(idle.pose(now: 1.05, speech: nil).brows, .neutral)
    }

    func testLeavingListeningDropsALoudBrowRaise() {
        var m = AvatarMachine()
        m.update(phase: .recording(generation: 1), now: 0)
        m.heard(levelDBFS: -5, now: 1)
        m.update(phase: .transcribing(generation: 1), now: 1.1)
        XCTAssertEqual(m.pose(now: 1.15, speech: nil).brows, .lowered)
    }

    func testReactionsLastAboutASecondAndAnyNewPhaseCancelsThem() {
        var m = AvatarMachine()
        m.react(.happy, now: 10)
        XCTAssertEqual(m.pose(now: 10.5, speech: nil), AvatarPose(mouth: .ee, brows: .raised))
        XCTAssertEqual(m.pose(now: 10 + AvatarMachine.reactionDuration + 0.01, speech: nil),
                       AvatarPose(mouth: .closed, brows: .neutral))
        m.react(.encouraging, now: 20)
        XCTAssertEqual(m.pose(now: 20.5, speech: nil), AvatarPose(mouth: .talk, brows: .neutral))
        m.update(phase: .recording(generation: 3), now: 20.6)
        XCTAssertEqual(m.mode, .listening)
        XCTAssertEqual(m.pose(now: 20.7, speech: nil).mouth, .closed)
    }

    func testAnUnchangedPhaseDoesNotCancelAReaction() {
        var m = AvatarMachine()
        m.update(phase: .idle, now: 0)
        m.react(.happy, now: 1)
        m.update(phase: .idle, now: 1.2)
        XCTAssertEqual(m.pose(now: 1.3, speech: nil).mouth, .ee)
    }
}
