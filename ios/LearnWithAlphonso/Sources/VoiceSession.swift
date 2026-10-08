import AVFoundation
import Foundation
import Observation
import SwiftUI
import LearnWithAlphonsoKit

/// Other in-app audio a voice turn must silence first. PodcastAudioPlayer
/// registers itself here in its init (RootView creates it once), so no voice
/// screen needs a reference to the player.
@MainActor
enum VoiceAudioHooks {
    static var pauseOtherAudio: (@MainActor () -> Void)?
}

/// What one hold-to-talk capture produced.
enum VoiceCapture {
    case audio(Data, generation: Int, debugTiming: String)
    case tooShort(generation: Int)
}

/// The single audio engine behind Hector, Practice, Campaigns and
/// speaking questions. It runs the Kit's VoiceSessionState reducer and
/// performs its effects against AVAudioSession, AVAudioRecorder and
/// AVAudioPlayer. Replaces four hand-copied TurnRecorders and their
/// isTornDown/isRequestingMic/wantsToStop/recordingGeneration flags.
///
/// Usage from a view:
/// - `appeared()` in onAppear, `disappeared()` in onDisappear;
/// - `pressBegan()` and `pressEnded()` from HoldToTalkButton;
/// - `onCapture` runs the network turn, calling `transcribed(_:)`,
///   `play(_:generation:)` or `replyWithoutAudio(_:)`, and `fail(_:_:)`.
///
/// After `onCapture` returns, the controller always sends `turnFinished`
/// (a defer), so no spinner can outlive its turn.
@MainActor
@Observable
final class VoiceSessionController {
    /// `.defaultToSpeaker` keeps replies off the earpiece; plain
    /// `.playAndRecord` routes playback to the receiver. `.allowBluetooth`
    /// keeps AirPods-style headsets as both mic and output. This is the only
    /// place the app sets a recording category (src/lib/ios-voice-guards.test.ts).
    nonisolated static let categoryOptions: AVAudioSession.CategoryOptions = [.defaultToSpeaker, .allowBluetooth]

    private(set) var state = VoiceSessionState()
    @ObservationIgnored var onCapture: ((VoiceCapture) async -> Void)?

    @ObservationIgnored private let recorder = VoiceRecorder()
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var playbackDelegate: PlaybackDelegate?
    @ObservationIgnored private var observers: [NSObjectProtocol] = []
    @ObservationIgnored private var pressBeganAt: Date?
    /// Identifies the recording the current press started, so a finish that outlives its recording cannot stop a newer one.
    @ObservationIgnored private var activeRecordingToken: Int?

    var phase: VoicePhase { state.phase }
    var isBusy: Bool { state.isBusy }
    var microphoneUnavailable: Bool { state.microphoneUnavailable }
    var recorderStartFailed: Bool { state.recorderStartFailed }
    var isRecording: Bool {
        if case .recording = state.phase { return true }
        return false
    }
    var failure: TutorError? {
        if case let .failed(error) = state.phase { return error }
        return nil
    }

    func appeared() {
        addObservers()
        send(.appeared)
    }

    func disappeared() {
        send(.disappeared)
        removeObservers()
    }

    /// Returns true when the press actually started a recording attempt.
    /// DragGesture calls this on every .onChanged; the repeats are ignored.
    @discardableResult
    func pressBegan() -> Bool {
        guard state.canStartPress else { return false }
        pressBeganAt = Date()
        send(.pressBegan)
        return true
    }

    func pressEnded() { send(.pressEnded) }

    func isCurrent(_ generation: Int) -> Bool { state.accepts(generation: generation) }

    func transcribed(_ generation: Int) { send(.transcribed(generation: generation)) }

    func fail(_ generation: Int, _ error: TutorError) { send(.failed(generation: generation, error)) }

    func replyWithoutAudio(_ generation: Int) { send(.replyReady(generation: generation, hasAudio: false)) }

    /// Plays a reply from the loudspeaker. Returns false if playback could not
    /// start; the turn itself still succeeded, so the caller shows a notice.
    /// A reply that arrives after the screen left is silently not played.
    @discardableResult
    func play(_ audio: Data, generation: Int) -> Bool {
        guard state.accepts(generation: generation) else { return true }
        send(.replyReady(generation: generation, hasAudio: true))
        do {
            try Self.configureForVoice()
            let newPlayer = try AVAudioPlayer(data: audio)
            let delegate = PlaybackDelegate { [weak self] in
                self?.send(.playbackFinished(generation: generation))
            }
            newPlayer.delegate = delegate
            player = newPlayer
            playbackDelegate = delegate
            if newPlayer.play() { return true }
        } catch {}
        send(.playbackFinished(generation: generation))
        return false
    }

    /// nonisolated: passed as VoiceRecorder.start's synchronous `configureSession`
    /// closure, which is not main-actor typed.
    nonisolated static func configureForVoice() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: categoryOptions)
        try session.setActive(true)
    }

    // MARK: - Effects

    private func send(_ event: VoiceSessionState.Event) {
        for effect in state.handle(event) { run(effect) }
    }

    private func run(_ effect: VoiceEffect) {
        switch effect {
        case .pauseOtherAudio:
            VoiceAudioHooks.pauseOtherAudio?()
        case let .requestPermission(generation):
            AVAudioApplication.requestRecordPermission { [weak self] granted in
                Task { @MainActor in
                    self?.send(.permissionResolved(generation: generation, granted: granted))
                }
            }
        case let .startRecorder(generation):
            do {
                activeRecordingToken = try recorder.start(configureSession: Self.configureForVoice)
                send(.recorderStarted(generation: generation))
            } catch {
                send(.recorderFailed(generation: generation))
            }
        case let .stopRecorderAndSubmit(generation):
            let pressElapsed = pressBeganAt.map { Date().timeIntervalSince($0) }
            let token = activeRecordingToken
            Task { await self.finishCapture(generation: generation, token: token, pressElapsed: pressElapsed) }
        case .cancelRecorder:
            activeRecordingToken = nil
            recorder.cancelIfRecording()
        case .stopPlayback:
            player?.stop()
            player = nil
            playbackDelegate = nil
        case .deactivateAudioSession:
            // Hands the session back; .notifyOthersOnDeactivation lets other
            // apps' audio resume. PodcastAudioPlayer is never auto-resumed.
            try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        }
    }

    private func finishCapture(generation: Int, token: Int?, pressElapsed: TimeInterval?) async {
        // Whatever onCapture does or throws, the busy phase ends here.
        defer { send(.turnFinished(generation: generation)) }
        // A quick tap or the hardware warm-up can finalize before anything was
        // captured (found live 2026-09-28): give the recorder its minimum run.
        if let remaining = recorder.remainingTimeToMinimumDuration() {
            try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
        }
        // The recording this finish belongs to may have been cancelled, or replaced by a newer press, while it slept.
        guard let token, recorder.isCurrent(token) else { return }
        let captureElapsed = recorder.elapsedSinceStart()
        let audio = await recorder.stop(token: token)
        guard state.accepts(generation: generation) else { return }
        guard let audio, audio.count >= VoiceRecorder.minimumAudioBytes else {
            await onCapture?(.tooShort(generation: generation))
            return
        }
        // TEMPORARY (2026-09-28): see AIConversationClient.transcribe's debugTiming.
        let debugTiming = "press=\(pressElapsed.map { String(format: "%.2f", $0) } ?? "?")" +
            " capture=\(captureElapsed.map { String(format: "%.2f", $0) } ?? "?")"
        await onCapture?(.audio(audio, generation: generation, debugTiming: debugTiming))
    }

    // MARK: - Interruptions and route changes

    private func addObservers() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        let session = AVAudioSession.sharedInstance()
        observers.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification, object: session, queue: .main
        ) { [weak self] notification in
            guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
            MainActor.assumeIsolated { self?.send(.interrupted) }
        })
        observers.append(center.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: session, queue: .main
        ) { [weak self] notification in
            guard let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
            // Headphones pulled mid-reply: stop rather than continue out loud.
            MainActor.assumeIsolated { self?.send(.outputRouteLost) }
        })
    }

    private func removeObservers() {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers = []
    }
}

private final class PlaybackDelegate: NSObject, AVAudioPlayerDelegate {
    private let onFinish: @MainActor () -> Void

    init(onFinish: @escaping @MainActor () -> Void) {
        self.onFinish = onFinish
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.onFinish() }
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in self.onFinish() }
    }
}

private enum VoiceRecorderError: Error {
    case recordCallFailed
}

/// One held press: start() records to a fresh temp file; stop() finalizes it
/// and returns the bytes. Carries over every live-found fix from the four
/// screen-private recorders it replaces:
/// - wait for the delegate before reading the file (container metadata was
///   read mid-finalization, 2026-09-28);
/// - treat record() == false as a failure;
/// - keep RecordingState balanced on every path, so a real phone call still
///   resumes the podcast later.
@MainActor
final class VoiceRecorder: NSObject, AVAudioRecorderDelegate {
    /// Well above api/stt.ts's `file.size < 512` floor.
    static let minimumAudioBytes = 4_096
    private static let minimumDuration: TimeInterval = 0.4

    private var recorder: AVAudioRecorder?
    private var fileURL: URL?
    private var startedAt: Date?
    private var finishContinuation: CheckedContinuation<Void, Never>?
    /// The recorder whose stop the continuation above is waiting for.
    private var stoppingRecorder: ObjectIdentifier?
    private var nextToken = 0
    private(set) var activeToken: Int?

    /// Starts a recording and returns its token. Only `stop(token:)` with that token can finish it.
    func start(configureSession: () throws -> Void) throws -> Int {
        // A leftover recording never leaks RecordingState's counter.
        cancelIfRecording()
        // Before touching the session, so the podcast player's interruption
        // handler sees an in-app mic takeover. See RecordingState.
        RecordingState.shared.began()
        do {
            try configureSession()
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
            ]
            let newRecorder = try AVAudioRecorder(url: url, settings: settings)
            newRecorder.delegate = self
            guard newRecorder.record() else { throw VoiceRecorderError.recordCallFailed }
            recorder = newRecorder
            fileURL = url
            startedAt = Date()
            nextToken += 1
            activeToken = nextToken
            return nextToken
        } catch {
            RecordingState.shared.ended()
            throw error
        }
    }

    func isCurrent(_ token: Int) -> Bool { activeToken == token }

    func remainingTimeToMinimumDuration() -> TimeInterval? {
        guard let startedAt else { return nil }
        let remaining = Self.minimumDuration - Date().timeIntervalSince(startedAt)
        return remaining > 0 ? remaining : nil
    }

    /// TEMPORARY (2026-09-28): call before stop(), which clears startedAt.
    func elapsedSinceStart() -> TimeInterval? {
        guard let startedAt else { return nil }
        return Date().timeIntervalSince(startedAt)
    }

    /// Finishes the recording `token` started and returns its bytes. A token that is no longer current (cancelled,
    /// or replaced by a newer press) returns nil and touches nothing.
    func stop(token: Int) async -> Data? {
        guard token == activeToken, let recorder, let fileURL else { return nil }
        RecordingState.shared.ended()
        // Detach before waiting, so a new press that starts meanwhile is never clobbered.
        activeToken = nil
        self.recorder = nil
        self.fileURL = nil
        startedAt = nil
        await withCheckedContinuation { continuation in
            finishContinuation = continuation
            stoppingRecorder = ObjectIdentifier(recorder)
            recorder.stop()
        }
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        try? FileManager.default.removeItem(at: fileURL)
        return data
    }

    /// For a screen torn down mid-hold (no .onEnded) or an interruption.
    /// No-op when nothing is recording.
    func cancelIfRecording() {
        guard let recorder else { return }
        activeToken = nil
        recorder.stop()
        self.recorder = nil
        if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
        fileURL = nil
        startedAt = nil
        RecordingState.shared.ended()
    }

    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        let finished = ObjectIdentifier(recorder)
        Task { @MainActor in
            // Only the recorder a stop is waiting for finishes it; a cancelled one's callback is ignored.
            guard self.stoppingRecorder == finished else { return }
            self.stoppingRecorder = nil
            self.finishContinuation?.resume()
            self.finishContinuation = nil
        }
    }
}

/// The hold-to-talk control every voice screen uses. The gesture lives on a
/// stable outer container, and the colour-changing circle inside is purely
/// visual: a view that changes its own appearance in response to state its
/// own gesture just set can reset the recognizer and fire a false release
/// (found live 2026-09-29). Direct touch with activation lets VoiceOver users
/// hold it (double-tap and hold) without exploratory swipes starting a recording.
struct HoldToTalkButton: View {
    let isRecording: Bool
    let idleColor: Color
    let recordingColor: Color
    var iconColor: Color = .white
    let accessibilityLabel: String
    let onPress: () -> Void
    let onRelease: () -> Void

    var body: some View {
        Color.clear
            .frame(width: 72, height: 72)
            .contentShape(Circle())
            .overlay(
                Circle()
                    .fill(isRecording ? recordingColor : idleColor)
                    .overlay(Image(systemName: "mic.fill").foregroundStyle(iconColor).font(.title2))
                    .allowsHitTesting(false)
            )
            .accessibilityLabel(accessibilityLabel)
            .accessibilityDirectTouch(true, options: .requiresActivation)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in onPress() }
                    .onEnded { _ in onRelease() }
            )
    }
}
