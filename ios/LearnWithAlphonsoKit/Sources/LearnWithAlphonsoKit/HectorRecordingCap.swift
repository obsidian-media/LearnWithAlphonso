import Foundation

/// How long one tap-to-record turn with Hector may run before it is stopped and sent. A held button was bounded by the
/// finger; a tapped one is not, so a forgotten tap must not leave the microphone open. Mirrors Android's
/// core/logic/HectorRecordingCap.kt and web's src/lib/hector-recording-cap.ts; keep the three equal.
public enum HectorRecordingCap {
    public static let seconds: Double = 60
}
