import AVFoundation
import UIKit
import LearnWithAlphonsoKit

/// Plays the short sound effects (Kenney.nl, CC0) and their light haptics. The rules (the Settings switch, never over
/// Alphonso or Hector, once per key) are the Kit's SoundEffectGate; this file only makes the sounds.
///
/// Audio session: effects never set a category over someone else's. While the session is still the untouched default
/// (solo ambient) they switch it to ambient + mix-with-others, so the silent switch silences them and the learner's
/// music keeps playing. The voice tutor (VoiceSession, play-and-record) and the podcast player (playback) set their
/// own categories before they play, so this never fights them, and it never activates or deactivates the session.
@MainActor
final class SoundEffectsPlayer {
    static let shared = SoundEffectsPlayer()

    private var players: [SoundEffect: AVAudioPlayer] = [:]
    /// Screens that play a voice (the call, the question cards' speech) register a probe; any true one means a voice
    /// is playing and the effect is skipped. Keyed, so registering again replaces rather than piles up.
    private var voiceProbes: [String: @MainActor () -> Bool] = [:]
    private lazy var gate = SoundEffectGate(
        isEnabled: {
            UserDefaults.standard.object(forKey: SoundEffectsPreference.key) as? Bool
                ?? SoundEffectsPreference.defaultValue
        },
        isVoiceActive: { [weak self] in
            MainActor.assumeIsolated { self?.voiceProbes.values.contains { $0() } ?? false }
        }
    )

    func registerVoiceProbe(_ id: String, _ probe: @escaping @MainActor () -> Bool) {
        voiceProbes[id] = probe
    }

    func unregisterVoiceProbe(_ id: String) {
        voiceProbes[id] = nil
    }

    /// Plays one effect now (and its haptic, which follows the system haptics setting, not this switch).
    func play(_ effect: SoundEffect, key: String? = nil) {
        guard gate.shouldPlay(effect, key: key) else { return }
        Self.useAmbientIfUntouched()
        guard let player = player(for: effect) else { return }
        player.currentTime = 0
        player.play()
    }

    /// Plays a timed sequence, each cue under its own key so a re-render cannot repeat it.
    func play(_ cues: [SoundEffectCue], key: String) {
        for cue in cues {
            let cueKey = "\(key)-\(cue.effect.rawValue)"
            if cue.delay <= 0 {
                play(cue.effect, key: cueKey)
                continue
            }
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(cue.delay))
                self?.play(cue.effect, key: cueKey)
            }
        }
    }

    /// Loads every effect ahead of its moment, so the first one plays without a lag.
    func preload() {
        for effect in SoundEffect.allCases { _ = player(for: effect) }
    }

    /// How long the call-start sound still has to play: a call's opening line waits this long.
    func callCueRemaining() -> TimeInterval { gate.callCueRemaining() }

    /// The light haptic for a moment, when it has one.
    func haptic(_ effect: SoundEffect) {
        switch effect.haptic {
        case .success: UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .warning: UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case nil: break
        }
    }

    private func player(for effect: SoundEffect) -> AVAudioPlayer? {
        if let ready = players[effect] { return ready }
        guard let url = Bundle.main.url(forResource: effect.fileName, withExtension: "mp3"),
              let made = try? AVAudioPlayer(contentsOf: url) else { return nil }
        made.prepareToPlay()
        players[effect] = made
        return made
    }

    private static func useAmbientIfUntouched() {
        let session = AVAudioSession.sharedInstance()
        guard session.category == .soloAmbient else { return }
        try? session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
    }
}
