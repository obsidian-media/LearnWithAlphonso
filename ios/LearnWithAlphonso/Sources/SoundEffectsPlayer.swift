import AVFoundation
import UIKit
import os
import LearnWithAlphonsoKit

/// Whether the voice tutor (VoiceSession) holds the audio session: set when it configures play-and-record, cleared
/// when it hands the session back. Sound effects read it so they never switch the category away from a live turn,
/// yet, once the voice is done, stop playing under play-and-record (which ignores the silent switch and, reactivated
/// by an effect, would stop the learner's music).
enum VoiceSessionHold {
    private static let held = OSAllocatedUnfairLock(initialState: false)
    static var isHeld: Bool { held.withLock { $0 } }
    static func set(_ value: Bool) { held.withLock { $0 = value } }
}

/// Plays the short sound effects (Kenney.nl, CC0) and their light haptics. The rules (the Settings switch, never over
/// Alphonso or Hector, once per key) are the Kit's SoundEffectGate; this file only makes the sounds.
///
/// Audio session: effects play under ambient + mix-with-others, so the silent switch silences them and the learner's
/// music keeps playing. They switch to it from the untouched default (solo ambient), and from the voice tutor's
/// play-and-record only once VoiceSession has handed the session back (VoiceSessionHold): never during a call, a
/// Practice turn or a speaking question, and VoiceSession sets its own category again before every turn and reply.
/// The podcast player's playback category is left alone (it may still be playing). This never activates or
/// deactivates the session itself.
@MainActor
final class SoundEffectsPlayer {
    static let shared = SoundEffectsPlayer()

    private var players: [SoundEffect: AVAudioPlayer] = [:]
    /// Cues still waiting for their moment (the complete screen's XP and achievement, a lost heart's sound).
    private var pendingCues: [UUID: Task<Void, Never>] = [:]
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

    /// Plays one effect now (and its haptic, which needs this switch on as well as the system haptics setting).
    func play(_ effect: SoundEffect, key: String? = nil) {
        guard gate.shouldPlay(effect, key: key) else { return }
        Self.useAmbientWhenFree()
        guard let player = player(for: effect) else { return }
        player.currentTime = 0
        player.play()
    }

    /// Plays a timed sequence, each cue under its own key so a re-render cannot repeat it. A screen that leaves calls
    /// cancelPendingCues, so a delayed cue never plays after the learner has gone (and, its key unused, it can still
    /// play if the screen comes back).
    func play(_ cues: [SoundEffectCue], key: String) {
        for cue in cues {
            let cueKey = "\(key)-\(cue.effect.rawValue)"
            if cue.delay <= 0 {
                play(cue.effect, key: cueKey)
                continue
            }
            let id = UUID()
            pendingCues[id] = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(cue.delay))
                guard !Task.isCancelled, let self else { return }
                self.pendingCues[id] = nil
                self.play(cue.effect, key: cueKey)
            }
        }
    }

    /// Drops every cue still waiting: the screen that asked for them is gone.
    func cancelPendingCues() {
        for task in pendingCues.values { task.cancel() }
        pendingCues.removeAll()
    }

    /// Loads every effect ahead of its moment, so the first one plays without a lag.
    func preload() {
        for effect in SoundEffect.allCases { _ = player(for: effect) }
    }

    /// How long the call-start sound still has to play: a call's opening line waits this long.
    func callCueRemaining() -> TimeInterval { gate.callCueRemaining() }

    /// The light haptic for a moment, when it has one.
    func haptic(_ effect: SoundEffect) {
        guard gate.shouldVibrate(effect) else { return }
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

    private static func useAmbientWhenFree() {
        let session = AVAudioSession.sharedInstance()
        // Already ambient: nothing to do. Playback: the podcast (or a voice preview) may still be playing. Held: a voice
        // turn is live. Otherwise it is the untouched default or the voice tutor's category, handed back.
        if session.category == .ambient || session.category == .playback || VoiceSessionHold.isHeld { return }
        try? session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
    }
}
