import AVFoundation
import SwiftUI
import UIKit

/// The approved scene clips (Visual refresh, living scenes). Each is a looping 9:16 mp4 with its character baked in,
/// bundled as the data asset `Clip-<name>` plus a first-frame image set `Clip-<name>-poster`.
enum ClipName: String, CaseIterable {
    case complete, hector, learn

    var dataAssetName: String { "Clip-\(rawValue)" }
    var posterName: String { "Clip-\(rawValue)-poster" }
}

/// A looping, silent clip filling whatever frame it is given (aspect-fill).
///
/// The poster (the clip's first frame, which is also its last, so the loop has no jump) is shown until the first
/// video frame is ready, so it never flashes black. Under Reduce Motion only the poster is shown, and the player
/// is created or torn down as the setting changes mid-session. It pauses when the view goes away or the app leaves
/// the foreground. Decorative, so hidden from VoiceOver.
struct SceneClip: View {
    let clip: ClipName

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var visible = false
    @State private var ready = false

    var body: some View {
        ZStack {
            Image(clip.posterName)
                .resizable()
                .aspectRatio(contentMode: .fill)
            if !reduceMotion {
                SceneClipPlayer(
                    clip: clip,
                    isPlaying: visible && scenePhase == .active,
                    onReady: { ready = true }
                )
                .opacity(ready ? 1 : 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .onAppear { visible = true }
        .onDisappear { visible = false }
        // A new player starts from "not ready" when Reduce Motion is switched off again; the poster covers it.
        .onChange(of: reduceMotion) { _, _ in ready = false }
        .accessibilityHidden(true)
    }
}

/// The AVFoundation half of `SceneClip`: an `AVQueuePlayer` + `AVPlayerLooper` drawing into an `AVPlayerLayer`.
/// Muted, and it never asks the system to keep the display awake, so a learner's music or podcast carries on.
struct SceneClipPlayer: UIViewRepresentable {
    let clip: ClipName
    let isPlaying: Bool
    let onReady: () -> Void

    final class Coordinator {
        var player: AVQueuePlayer?
        var looper: AVPlayerLooper?
        var observation: NSKeyValueObservation?
        var onReady: () -> Void = {}

        func observeReadiness(of layer: AVPlayerLayer) {
            observation = layer.observe(\.isReadyForDisplay, options: [.initial, .new]) { [weak self] layer, _ in
                guard layer.isReadyForDisplay else { return }
                DispatchQueue.main.async { self?.onReady() }
            }
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> ClipPlayerUIView {
        let view = ClipPlayerUIView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        view.playerLayer.videoGravity = .resizeAspectFill
        context.coordinator.onReady = onReady
        if let url = Self.fileURL(for: clip) {
            let player = AVQueuePlayer()
            player.isMuted = true
            player.preventsDisplaySleepDuringVideoPlayback = false
            context.coordinator.looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
            context.coordinator.player = player
            view.playerLayer.player = player
            context.coordinator.observeReadiness(of: view.playerLayer)
        }
        return view
    }

    func updateUIView(_ uiView: ClipPlayerUIView, context: Context) {
        context.coordinator.onReady = onReady
        guard let player = context.coordinator.player else { return }
        if isPlaying {
            player.play()
        } else {
            player.pause()
        }
    }

    static func dismantleUIView(_ uiView: ClipPlayerUIView, coordinator: Coordinator) {
        coordinator.player?.pause()
        coordinator.looper?.disableLooping()
        coordinator.observation = nil
        uiView.playerLayer.player = nil
    }

    /// AVPlayer needs a file URL, so the data asset is written to the caches directory once per build and reused.
    /// The build number is in the name so a clip replaced in an update never plays a stale copy.
    private static func fileURL(for clip: ClipName) -> URL? {
        guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let build = (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "0"
        let url = caches.appendingPathComponent("\(clip.dataAssetName)-\(build).mp4")
        if FileManager.default.fileExists(atPath: url.path) { return url }
        guard let asset = NSDataAsset(name: clip.dataAssetName) else { return nil }
        do {
            try asset.data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }
}

/// A view whose backing layer is an `AVPlayerLayer`.
final class ClipPlayerUIView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }

    var playerLayer: AVPlayerLayer {
        // layerClass above guarantees the type.
        layer as! AVPlayerLayer // swiftlint:disable:this force_cast
    }
}

/// Something drawn on a clip at a spot in the clip's own frame, as a percent of its width (`x`) and height (`y`).
/// The content's bottom centre sits on that spot, so a speech bubble's tail lands on the character's head.
struct ClipPin {
    var x: CGFloat
    var y: CGFloat
    var content: AnyView

    init<Content: View>(x: CGFloat, y: CGFloat, @ViewBuilder content: () -> Content) {
        self.x = x
        self.y = y
        self.content = AnyView(content())
    }
}

/// A clip laid out exactly like an aspect-fill image of 9:16, plus an optional pin in the clip's own coordinates.
///
/// The clip frame is `max(w, h * 9/16)` by `max(h, w * 16/9)`, centred horizontally and placed vertically by
/// `verticalAnchor` (1 = bottom-aligned, 0 = top-aligned, like CSS `object-position`). Because that rect is
/// known, a pin at (x%, y%) of it stays on the same spot of the picture at every screen size, the way the web's
/// `SceneBackdrop` does it.
struct ClipBackdrop: View {
    let clip: ClipName
    var verticalAnchor: CGFloat = 1
    var pin: ClipPin? = nil

    var body: some View {
        GeometryReader { proxy in
            let w = proxy.size.width
            let h = proxy.size.height
            let frameW = max(w, h * 9 / 16)
            let frameH = max(h, w * 16 / 9)
            ZStack(alignment: .topLeading) {
                SceneClip(clip: clip)
                    .frame(width: frameW, height: frameH)
                if let pin {
                    pin.content
                        .alignmentGuide(.leading) { $0.width / 2 - frameW * pin.x / 100 }
                        .alignmentGuide(.top) { $0.height - frameH * pin.y / 100 }
                }
            }
            .frame(width: frameW, height: frameH, alignment: .topLeading)
            .offset(x: (w - frameW) / 2, y: (h - frameH) * verticalAnchor)
        }
        .clipped()
    }
}
