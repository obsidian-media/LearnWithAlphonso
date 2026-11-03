import XCTest
@testable import LearnWithAlphonsoKit

final class HectorStatusTests: XCTestCase {
    func testRecordingIsListening() {
        XCTAssertEqual(HectorStatus.from(phase: .recording(generation: 1), handsFree: .off), .listening)
    }

    func testHandsFreeListeningOrHearingIsListening() {
        XCTAssertEqual(HectorStatus.from(phase: .idle, handsFree: .listening), .listening)
        XCTAssertEqual(HectorStatus.from(phase: .idle, handsFree: .hearing), .listening)
    }

    func testTranscribingAndThinkingAreThinking() {
        XCTAssertEqual(HectorStatus.from(phase: .transcribing(generation: 1), handsFree: .off), .thinking)
        XCTAssertEqual(HectorStatus.from(phase: .thinking(generation: 1), handsFree: .waiting), .thinking)
    }

    func testSpeakingIsSpeaking() {
        XCTAssertEqual(HectorStatus.from(phase: .speaking(generation: 1), handsFree: .waiting), .speaking)
    }

    func testIdleOffAndPausedHaveNoStatus() {
        XCTAssertNil(HectorStatus.from(phase: .idle, handsFree: .off))
        XCTAssertNil(HectorStatus.from(phase: .idle, handsFree: .paused(.byLearner)))
    }

    func testLabelsAndMoments() {
        XCTAssertEqual(HectorStatus.listening.label, "Listening")
        XCTAssertEqual(HectorStatus.thinking.label, "Thinking")
        XCTAssertEqual(HectorStatus.speaking.label, "Speaking")
        XCTAssertEqual(HectorStatus.listening.moment, .hectorListening)
        XCTAssertEqual(HectorStatus.speaking.moment, .hectorSpeaking)
        XCTAssertEqual(HectorStatus.moment(for: nil), .hectorIdle)
    }
}
