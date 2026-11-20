import AVFoundation
import Observation
import SwiftUI
import LearnWithAlphonsoKit

/// The audio behind Say it right's "Hear you vs Alphonso": the learner's last attempt and Alphonso's model for the
/// shown word, held IN MEMORY ONLY (`Data` in this object, never saved or uploaded; the recording's one upload is the
/// /api/stt call that already happens) and freed by `release()` when the word changes and when the screen closes.
///
/// One clip plays at a time. Playing one stops the other. "Say it slower" plays the model's SAME bytes at
/// `Waveform.slowRate` through AVAudioPlayer's own rate control (`enableRate`), which keeps the pitch, so it costs no
/// second /api/tts call.
///
/// Waveforms: the clip's bytes are written to a temporary file just long enough for AVAudioFile to read the samples
/// (AVAudioFile only opens a URL), the file is deleted straight after, and the samples go through the Kit's
/// `Waveform.peaks`. A clip that cannot be decoded keeps nil peaks: the screen draws a flat row and playing still works.
@MainActor
@Observable
final class PronunciationClips {
    enum Playing: Equatable {
        case you
        case model(slow: Bool)
    }

    private(set) var playing: Playing?
    /// 0...1 through the clip that is playing (ignored under Reduce Motion).
    private(set) var progress: Double = 0
    private(set) var hasYou = false
    private(set) var youPeaks: [Double]?
    private(set) var modelPeaks: [Double]?

    @ObservationIgnored private var youAudio: Data?
    @ObservationIgnored private var modelAudio: Data?
    @ObservationIgnored private var modelTerm: String?
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var delegate: ClipPlayerDelegate?
    @ObservationIgnored private var ticker: Task<Void, Never>?
    /// Bumped whenever that clip is replaced or freed, so a late decode never lands on the wrong attempt or word. One
    /// each: a new attempt must not invalidate the model's pending decode.
    @ObservationIgnored private var youSerial = 0
    @ObservationIgnored private var modelSerial = 0

    /// Deletes any decode temp file a killed process left behind (the learner's voice). At launch and when the screen opens.
    nonisolated static func sweepLeftovers() { ClipTempFiles.sweep(in: FileManager.default.temporaryDirectory) }

    /// Whether Alphonso's audio for `term` is already held (so Hear it, the waveform and Say it slower reuse it).
    func hasModel(for term: String) -> Bool { modelAudio != nil && modelTerm == term }

    /// Keeps the learner's latest attempt, replacing the last one.
    func setYou(_ audio: Data) {
        if playing == .you { stop() }
        youSerial += 1
        let mine = youSerial
        youAudio = audio
        hasYou = true
        youPeaks = nil
        Task {
            let peaks = await Task.detached { Self.decodePeaks(audio, fileExtension: "m4a") }.value
            if mine == youSerial, hasYou { youPeaks = peaks }
        }
    }

    /// Keeps the model audio the screen just fetched for `term`.
    func setModel(_ audio: Data, term: String) {
        modelSerial += 1
        let mine = modelSerial
        modelAudio = audio
        modelTerm = term
        modelPeaks = nil
        Task {
            let peaks = await Task.detached { Self.decodePeaks(audio, fileExtension: "mp3") }.value
            if mine == modelSerial, modelTerm == term { modelPeaks = peaks }
        }
    }

    /// Plays one clip (stopping whatever else is playing). False when there is nothing to play or it will not start.
    @discardableResult
    func play(_ clip: Playing) -> Bool {
        stop()
        let data: Data?
        switch clip {
        case .you: data = youAudio
        case .model: data = modelAudio
        }
        guard let data else { return false }
        VoiceAudioHooks.pauseOtherAudio?()
        try? VoiceSessionController.configureForVoice()
        guard let newPlayer = try? AVAudioPlayer(data: data) else { return false }
        if case .model(slow: true) = clip {
            newPlayer.enableRate = true
            newPlayer.rate = Waveform.slowRate
        }
        let newDelegate = ClipPlayerDelegate { [weak self] in
            Task { @MainActor in self?.finished() }
        }
        newPlayer.delegate = newDelegate
        newPlayer.prepareToPlay()
        guard newPlayer.play() else { return false }
        player = newPlayer
        delegate = newDelegate
        playing = clip
        progress = 0
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                if let player = self?.player, player.duration > 0 { self?.progress = min(1, player.currentTime / player.duration) }
                try? await Task.sleep(for: .milliseconds(50))
            }
        }
        return true
    }

    /// Tap a waveform: plays that clip, or stops it when it is the one already playing.
    func toggle(_ clip: Playing) {
        if playing == clip { stop() } else { play(clip) }
    }

    func stop() {
        ticker?.cancel()
        ticker = nil
        player?.stop()
        player = nil
        delegate = nil
        playing = nil
        progress = 0
    }

    /// Frees every clip (the word changed, or the screen closed).
    func release() {
        stop()
        youSerial += 1
        modelSerial += 1
        youAudio = nil
        modelAudio = nil
        modelTerm = nil
        hasYou = false
        youPeaks = nil
        modelPeaks = nil
    }

    private func finished() { stop() }

    /// The bars for a clip's bytes, or nil when they cannot be decoded. Off the main actor.
    nonisolated static func decodePeaks(_ data: Data, fileExtension: String) -> [Double]? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(ClipTempFiles.name(fileExtension: fileExtension))
        do { try data.write(to: url, options: .atomic) } catch { return nil }
        defer { try? FileManager.default.removeItem(at: url) }
        guard let file = try? AVAudioFile(forReading: url) else { return nil }
        // A word is a second or two; the cap only protects memory from a surprise.
        let cap = AVAudioFrameCount(file.processingFormat.sampleRate * 30)
        let frames = min(AVAudioFrameCount(max(0, file.length)), cap)
        guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: frames) else { return nil }
        do { try file.read(into: buffer, frameCount: frames) } catch { return nil }
        guard let channel = buffer.floatChannelData?[0] else { return nil }
        let samples = Array(UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength)))
        return samples.isEmpty ? nil : Waveform.peaks(samples)
    }
}

/// AVAudioPlayer reports the end of a clip to an NSObject delegate.
private final class ClipPlayerDelegate: NSObject, AVAudioPlayerDelegate, @unchecked Sendable {
    private let onFinish: @Sendable () -> Void
    init(onFinish: @escaping @Sendable () -> Void) { self.onFinish = onFinish }
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) { onFinish() }
    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) { onFinish() }
}

/// One side of "Hear you vs Alphonso": a single button holding a bar waveform. Its VoiceOver name is fixed ("Play your
/// recording" / "Play Alphonso's version") with the playing state announced as its value. While it plays the bars sweep
/// left to right; under Reduce Motion the whole row is simply highlighted (no sweep). Nil peaks (a clip that would not
/// decode) draw a flat row, and the button still plays.
struct ClipWaveButton: View {
    let who: String
    let spokenLabel: String
    let peaks: [Double]?
    let isPlaying: Bool
    let progress: Double
    let reduceMotion: Bool
    let tint: Color
    let action: () -> Void
    @Environment(\.alphonsoDS) private var ds

    /// Height of a bar that holds no sound (and of every bar while the clip cannot be drawn), as a share of the row.
    private static let minBar = 0.12
    private static let rowHeight: CGFloat = AlphonsoDS.Space.s12 - AlphonsoDS.Space.s2

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                Text(who).dsText(.caption).foregroundStyle(ds.inkSoft)
                bars
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(AlphonsoDS.Space.s3)
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
            .overlay(
                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control)
                    .stroke(isPlaying ? tint : ds.line, lineWidth: isPlaying ? 2 : 1.5)
            )
            .contentShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel)
        .accessibilityValue(isPlaying ? "Playing" : "")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier(spokenLabel)
    }

    private var bars: some View {
        let heights = peaks ?? [Double](repeating: 0, count: Waveform.bars)
        return HStack(alignment: .center, spacing: 2) {
            ForEach(heights.indices, id: \.self) { i in
                let on = isPlaying && (reduceMotion || Double(i + 1) / Double(heights.count) <= progress)
                Capsule()
                    .fill(on ? tint : ds.line)
                    .frame(maxWidth: .infinity)
                    .frame(height: Self.rowHeight * CGFloat(max(Self.minBar, heights[i])))
            }
        }
        .frame(height: Self.rowHeight)
        .accessibilityHidden(true)
    }
}
