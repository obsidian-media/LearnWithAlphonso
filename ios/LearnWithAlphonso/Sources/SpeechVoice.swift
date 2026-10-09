import AVFoundation
import LearnWithAlphonsoKit

/// The one place the app chooses an on-device voice. Every AVSpeechUtterance takes its voice from
/// here, so the course-to-locale rule lives only in the Kit (`Course.speechLocaleCandidates`).
/// Guarded by src/lib/ios-binary-polish.test.ts: `AVSpeechSynthesisVoice(language:` appears nowhere else.
enum SpeechVoice {
    static func voice(for course: Course) -> AVSpeechSynthesisVoice? {
        for code in course.speechLocaleCandidates {
            if let voice = AVSpeechSynthesisVoice(language: code) { return voice }
        }
        return nil
    }
}
