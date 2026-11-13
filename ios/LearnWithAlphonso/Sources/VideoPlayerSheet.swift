import AVFoundation
import SwiftUI
import UIKit
import LearnWithAlphonsoKit

/// The state behind the Watch shelf's player sheet: an AVPlayer for the mp4, the parsed WebVTT cues and the saving of
/// progress. AVPlayer does not load a sidecar .vtt for a progressive mp4, so the captions are fetched, parsed by the Kit's
/// `WebVTT` and drawn by the view over the picture. All rules (resume, speeds, thresholds) are `VideoShelf` in the Kit.
@MainActor
@Observable
final class VideoPlayerModel {
    let video: LibraryVideo
    let player = AVPlayer()
    private let client: PodcastClient?
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var notificationTokens: [NSObjectProtocol] = []
    @ObservationIgnored private var statusObservation: NSKeyValueObservation?
    @ObservationIgnored private var lastSaved: Double = 0
    @ObservationIgnored private var startedTracked = false
    @ObservationIgnored private var closed = false

    private(set) var cues: [WebVTTCue] = []
    private(set) var time: Double = 0
    private(set) var duration: Double
    private(set) var isPlaying = false
    private(set) var ended = false
    private(set) var failed = false
    private(set) var speed: Double = 1
    var captionsOn = VideoShelf.captionsDefaultOn

    init(video: LibraryVideo, client: PodcastClient?) {
        self.video = video
        self.client = client
        self.duration = Double(video.durationSeconds)
    }

    /// The caption to draw now, or nil when captions are off or no cue is showing.
    var currentCaption: String? {
        captionsOn ? WebVTT.cue(at: time, in: cues)?.text : nil
    }

    func start(autoplay: Bool, pauseOtherAudio: () -> Void) async {
        guard !closed else { return }
        load()
        let resume = VideoShelf.resumeSeconds(video)
        if resume > 0 {
            time = Double(resume)
            _ = await player.seek(to: CMTime(seconds: Double(resume), preferredTimescale: 600))
        }
        if let text = await client?.fetchCaptions(url: video.captionsURL) { cues = WebVTT.parse(text) }
        if autoplay && !closed { play(pauseOtherAudio: pauseOtherAudio) }
    }

    private func load() {
        let item = AVPlayerItem(url: video.videoURL)
        player.replaceCurrentItem(with: item)
        failed = false
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] observed, _ in
            let status = observed.status
            Task { @MainActor [weak self] in
                if status == .failed { self?.failed = true }
            }
        }
        let center = NotificationCenter.default
        notificationTokens = [
            center.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.didPlayToEnd() }
            },
            center.addObserver(forName: AVPlayerItem.failedToPlayToEndTimeNotification, object: item, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.failed = true }
            },
        ]
        if timeObserver == nil {
            timeObserver = player.addPeriodicTimeObserver(
                forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main
            ) { [weak self] cmTime in
                MainActor.assumeIsolated { self?.tick(cmTime.seconds) }
            }
        }
    }

    private func tick(_ seconds: Double) {
        guard seconds.isFinite, !ended else { return }
        time = seconds
        if let length = player.currentItem?.duration.seconds, length.isFinite, length > 0 { duration = length }
        if isPlaying && seconds - lastSaved >= VideoShelf.saveEverySeconds { save(seconds) }
    }

    func play(pauseOtherAudio: () -> Void) {
        guard !closed else { return }
        if ended {
            ended = false
            time = 0
            lastSaved = 0
            player.seek(to: .zero)
        }
        pauseOtherAudio()
        let audio = AVAudioSession.sharedInstance()
        try? audio.setCategory(.playback, mode: .moviePlayback)
        try? audio.setActive(true)
        player.defaultRate = Float(speed)
        player.play()
        isPlaying = true
        if !startedTracked {
            startedTracked = true
            Analytics.track(.videoStarted, ["video_id": video.id, "course": video.course])
        }
    }

    func pause() {
        player.pause()
        isPlaying = false
        if !ended, time > 0 { save(time) }
    }

    func toggle(pauseOtherAudio: () -> Void) {
        if isPlaying { pause() } else { play(pauseOtherAudio: pauseOtherAudio) }
    }

    func cycleSpeed() {
        speed = VideoShelf.nextSpeed(after: speed)
        player.defaultRate = Float(speed)
        if isPlaying { player.rate = Float(speed) }
    }

    func seek(to seconds: Double) {
        let target = min(max(0, seconds), duration)
        time = target
        ended = false
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
    }

    func retry(pauseOtherAudio: () -> Void) {
        load()
        player.seek(to: CMTime(seconds: time, preferredTimescale: 600))
        play(pauseOtherAudio: pauseOtherAudio)
    }

    private func didPlayToEnd() {
        isPlaying = false
        ended = true
        time = duration
        save(duration)
        Analytics.track(.videoCompleted, ["video_id": video.id, "course": video.course])
    }

    private func save(_ seconds: Double) {
        lastSaved = seconds
        let client = client
        let id = video.id
        let rounded = Int(seconds.rounded())
        // Garnish, like the podcast position: a failed save must never interrupt the video.
        Task { try? await client?.saveVideoProgress(videoID: id, progressSeconds: rounded) }
    }

    /// Stops playback, saves where the learner stopped and lets go of the player.
    func close() {
        guard !closed else { return }
        if !ended, time > 0 { save(time) }
        closed = true
        player.pause()
        isPlaying = false
        if let timeObserver { player.removeTimeObserver(timeObserver) }
        timeObserver = nil
        for token in notificationTokens { NotificationCenter.default.removeObserver(token) }
        notificationTokens = []
        statusObservation = nil
        player.replaceCurrentItem(with: nil)
    }
}

/// The player sheet (mock mocks-r8, cell A3): a vertical video with play and pause, a scrubber, a speed button and a
/// captions button. Captions are ON when it opens and are drawn from the video's WebVTT file. When the video ends, one tap
/// goes to the matching practice item. VoiceOver: every control is a labelled button, the scrubber is an adjustable slider
/// and the current caption is a live label. Reduce Motion: the video does not start by itself.
struct VideoPlayerSheet: View {
    let video: LibraryVideo
    let client: PodcastClient?
    let pauseOtherAudio: () -> Void
    /// Where the practice button goes: the sheet closes first, then the app switches to that tab and opens it.
    let onPractice: (PathDestination) -> Void
    let onClose: () -> Void

    @State private var model: VideoPlayerModel?
    @State private var scrubbing = false
    @State private var scrubValue = 0.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            HStack {
                Text(video.title)
                    .dsText(.headline).foregroundStyle(ds.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: AlphonsoDS.Space.s2)
                Button { close() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .imageScale(.large)
                        .foregroundStyle(ds.inkSoft)
                        .frame(minWidth: AlphonsoDS.Space.minTouch, minHeight: AlphonsoDS.Space.minTouch)
                }
                .accessibilityLabel("Close video")
            }
            if let model {
                picture(model)
                controls(model)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .padding(AlphonsoDS.Space.gutter)
        .background(ds.surface.ignoresSafeArea())
        .task {
            let created = VideoPlayerModel(video: video, client: client)
            model = created
            await created.start(autoplay: !reduceMotion, pauseOtherAudio: pauseOtherAudio)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active, model?.isPlaying == true { model?.pause() }
        }
        .onDisappear { model?.close() }
    }

    private func close() {
        model?.close()
        onClose()
    }

    private func picture(_ m: VideoPlayerModel) -> some View {
        ZStack(alignment: .bottom) {
            PlayerLayerView(player: m.player)
            if let caption = m.currentCaption {
                Text(caption)
                    .dsText(.headline)
                    .foregroundStyle(ds.onHero)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, AlphonsoDS.Space.s3)
                    .padding(.vertical, AlphonsoDS.Space.s2)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key, style: .continuous).fill(ds.hero.opacity(0.8)))
                    .padding(AlphonsoDS.Space.s3)
                    .accessibilityLabel("Caption: \(caption)")
            }
            if m.failed {
                scrim {
                    Text("We couldn't play this video.").dsText(.headline).foregroundStyle(ds.onHero)
                    Button("Try again") { m.retry(pauseOtherAudio: pauseOtherAudio) }
                        .buttonStyle(.borderedProminent).tint(ds.action)
                }
            } else if m.ended {
                scrim {
                    Text("Nice work").dsText(.title).foregroundStyle(ds.onHero)
                    if let practice = video.practice, let destination = VideoShelf.practiceDestination(practice) {
                        Button(VideoShelf.practiceLabel(practice)) {
                            m.close()
                            onPractice(destination)
                        }
                        .buttonStyle(.borderedProminent).tint(ds.action)
                    }
                    Button("Watch again") { m.play(pauseOtherAudio: pauseOtherAudio) }
                        .tint(ds.onHero)
                }
            }
        }
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
        .frame(maxHeight: .infinity)
        .background(ds.ink)
        .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
    }

    private func scrim<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: AlphonsoDS.Space.s3) { content() }
            .padding(AlphonsoDS.Space.s6)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(ds.hero.opacity(0.85))
    }

    private func controls(_ m: VideoPlayerModel) -> some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            Slider(
                value: Binding(get: { scrubbing ? scrubValue : m.time }, set: { scrubValue = $0 }),
                in: 0...max(1, m.duration),
                onEditingChanged: { editing in
                    scrubbing = editing
                    if !editing { m.seek(to: scrubValue) }
                }
            )
            .tint(ds.action)
            .accessibilityLabel("Seek")
            .accessibilityValue("\(VideoShelf.clock(m.time)) of \(VideoShelf.clock(m.duration))")
            HStack(spacing: AlphonsoDS.Space.s3) {
                Button { m.toggle(pauseOtherAudio: pauseOtherAudio) } label: {
                    Image(systemName: m.isPlaying ? "pause.fill" : "play.fill")
                        .foregroundStyle(ds.onAction)
                        .frame(width: AlphonsoDS.Space.s12, height: AlphonsoDS.Space.s12)
                        .background(Circle().fill(ds.action))
                }
                .accessibilityLabel(m.isPlaying ? "Pause" : "Play")
                Text("\(VideoShelf.clock(m.time)) / \(VideoShelf.clock(m.duration))")
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
                    .monospacedDigit()
                Spacer(minLength: 0)
                Button { m.cycleSpeed() } label: {
                    Text(VideoShelf.speedLabel(m.speed))
                        .dsText(.footnote).foregroundStyle(ds.ink)
                        .frame(minWidth: AlphonsoDS.Space.minTouch + AlphonsoDS.Space.s2, minHeight: AlphonsoDS.Space.minTouch)
                        .background(Capsule().stroke(ds.line, lineWidth: 1))
                }
                .accessibilityLabel("Playback speed \(VideoShelf.speedLabel(m.speed))")
                .accessibilityHint("Changes the speed")
                Button { m.captionsOn.toggle() } label: {
                    Text("CC")
                        .dsText(.footnote)
                        .foregroundStyle(m.captionsOn ? ds.onAction : ds.inkSoft)
                        .frame(minWidth: AlphonsoDS.Space.minTouch, minHeight: AlphonsoDS.Space.minTouch)
                        .background(Capsule().fill(m.captionsOn ? ds.action : ds.card))
                }
                .accessibilityLabel("Captions")
                .accessibilityAddTraits(m.captionsOn ? .isSelected : [])
            }
        }
    }
}

/// An AVPlayerLayer as a SwiftUI view: the picture only, so the sheet draws its own controls and captions.
private struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerContainerView {
        let view = PlayerContainerView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspect
        return view
    }

    func updateUIView(_ uiView: PlayerContainerView, context: Context) {}
}

private final class PlayerContainerView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}
