import XCTest
@testable import LearnWithAlphonsoKit

final class SoundEffectsTests: XCTestCase {
    private func gate(on: @escaping () -> Bool = { true }, voice: @escaping () -> Bool = { false },
                      now: @escaping () -> Date = { Date(timeIntervalSince1970: 0) }) -> SoundEffectGate {
        SoundEffectGate(isEnabled: on, isVoiceActive: voice, now: now)
    }

    func testEachEffectHasItsOwnFile() {
        let expected: [SoundEffect: String] = [
            .right: "sfx-right", .wrong: "sfx-wrong", .lessonComplete: "sfx-lesson-complete", .xp: "sfx-xp",
            .heartLost: "sfx-heart-lost", .tap: "sfx-tap", .callStart: "sfx-call-start", .callEnd: "sfx-call-end",
            .achievement: "sfx-achievement",
        ]
        XCTAssertEqual(SoundEffect.allCases.count, expected.count)
        for effect in SoundEffect.allCases {
            XCTAssertEqual(effect.fileName, expected[effect], "\(effect)")
        }
    }

    func testTheSwitchIsOnByDefault() {
        XCTAssertTrue(SoundEffectsPreference.defaultValue)
        XCTAssertEqual(SoundEffectsPreference.key, "soundEffectsEnabled")
    }

    func testSwitchOffPlaysNothing() {
        let g = gate(on: { false })
        for effect in SoundEffect.allCases {
            XCTAssertFalse(g.shouldPlay(effect, key: nil), "\(effect)")
        }
    }

    func testSwitchIsReadAtPlayTime() {
        var on = true
        let g = gate(on: { on })
        XCTAssertTrue(g.shouldPlay(.right, key: nil))
        on = false
        XCTAssertFalse(g.shouldPlay(.right, key: nil))
    }

    func testNoEffectWhileTheVoiceIsSpeaking() {
        var speaking = true
        let g = gate(voice: { speaking })
        XCTAssertFalse(g.shouldPlay(.right, key: nil))
        speaking = false
        XCTAssertTrue(g.shouldPlay(.right, key: nil))
    }

    func testFiresOncePerKey() {
        let g = gate()
        XCTAssertTrue(g.shouldPlay(.lessonComplete, key: "finish-1"))
        XCTAssertFalse(g.shouldPlay(.lessonComplete, key: "finish-1"))
        XCTAssertTrue(g.shouldPlay(.lessonComplete, key: "finish-2"))
        XCTAssertTrue(g.shouldPlay(.tap, key: nil))
        XCTAssertTrue(g.shouldPlay(.tap, key: nil))
    }

    func testASkippedEffectDoesNotUseUpItsKey() {
        var speaking = true
        let g = gate(voice: { speaking })
        XCTAssertFalse(g.shouldPlay(.right, key: "q1"))
        speaking = false
        XCTAssertTrue(g.shouldPlay(.right, key: "q1"))
    }

    func testCallCueRemainingSoTheOpeningLineCanWait() {
        var t = Date(timeIntervalSince1970: 1)
        let g = gate(now: { t })
        XCTAssertEqual(g.callCueRemaining(), 0)
        XCTAssertTrue(g.shouldPlay(.callStart, key: nil))
        t = Date(timeIntervalSince1970: 1.1)
        XCTAssertEqual(g.callCueRemaining(), 0.63, accuracy: 0.001)
        t = Date(timeIntervalSince1970: 5)
        XCTAssertEqual(g.callCueRemaining(), 0)
    }

    func testNothingToWaitForWhenTheCallCueDidNotPlay() {
        let g = gate(on: { false })
        _ = g.shouldPlay(.callStart, key: nil)
        XCTAssertEqual(g.callCueRemaining(), 0)
    }

    func testVerdictCues() {
        XCTAssertEqual(SoundEffectCues.verdict(correct: true, losesHeart: false), [.init(effect: .right, delay: 0)])
        XCTAssertEqual(SoundEffectCues.verdict(correct: false, losesHeart: false), [.init(effect: .wrong, delay: 0)])
        XCTAssertEqual(SoundEffectCues.verdict(correct: false, losesHeart: true), [
            .init(effect: .wrong, delay: 0), .init(effect: .heartLost, delay: SoundEffect.wrong.duration),
        ])
    }

    func testFinishCues() {
        XCTAssertEqual(SoundEffectCues.finish(xp: 0, unlocked: 0), [.init(effect: .lessonComplete, delay: 0)])
        XCTAssertEqual(SoundEffectCues.finish(xp: 12, unlocked: 2), [
            .init(effect: .lessonComplete, delay: 0), .init(effect: .xp, delay: 1.2), .init(effect: .achievement, delay: 1.7),
        ])
    }

    func testHaptics() {
        XCTAssertEqual(SoundEffect.right.haptic, .success)
        XCTAssertEqual(SoundEffect.wrong.haptic, .warning)
        XCTAssertEqual(SoundEffect.lessonComplete.haptic, .success)
        XCTAssertEqual(SoundEffect.achievement.haptic, .success)
        for effect: SoundEffect in [.xp, .heartLost, .tap, .callStart, .callEnd] {
            XCTAssertNil(effect.haptic, "\(effect)")
        }
    }
}
