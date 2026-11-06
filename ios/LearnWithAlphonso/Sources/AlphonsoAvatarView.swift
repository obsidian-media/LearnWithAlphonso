import SwiftUI
import UIKit
import QuartzCore
import LearnWithAlphonsoKit

/// The talking 2D Alphonso at the top of the Practice speaking screen, "on a video call". He listens while the
/// learner holds the button, thinks while the reply is made, and talks with lip sync while it plays. The logic
/// (mouth shapes, timing, state, idle life) is the Kit's Avatar* files; this file only draws it.
///
/// Decorative: hidden from VoiceOver (the transcript bubbles are the accessible captions), never takes a touch,
/// and nothing here waits on or blocks the voice session.

/// The art, decoded once. The folder `AlphonsoAvatar` is a bundle folder reference (project.yml).
@MainActor
private enum AvatarArt {
    private static var cache: [String: UIImage] = [:]

    static func image(_ file: String) -> UIImage? {
        if let hit = cache[file] { return hit }
        let path = Bundle.main.bundlePath + "/AlphonsoAvatar/" + file
        guard let loaded = UIImage(contentsOfFile: path) else { return nil }
        // contentsOfFile only maps the file; the WebP would otherwise decode lazily at first draw (and again if
        // the system purges the decode). Decode now, once, and cache the bitmap.
        let image = loaded.preparingForDisplay() ?? loaded
        cache[file] = image
        return image
    }
}

/// The verdict that came with the latest reply, numbered so one reply is reacted to once however often the view
/// redraws. A new conversation or a new reply bumps `serial`.
struct AvatarReplyVerdict: Equatable {
    var serial = 0
    var verdict: ReplyVerdict = .inconclusive
}

/// Everything one frame needs.
private struct AvatarFrame {
    var pose = AvatarPose(mouth: .closed, brows: .neutral)
    var leftEarTwitch = false
    var rightEarTwitch = false
    var glint: Double?
    var swayDegrees = 0.0
    var breath: (x: Double, y: Double) = (1, 1)
}

/// Holds the machine and the idle scheduler between frames. Not observable on purpose: the TimelineView redraws
/// on its own clock, and a change here must not invalidate the view mid-frame.
@MainActor
private final class AvatarDriver {
    private var machine = AvatarMachine()
    private var idle = AvatarIdleScheduler(random: AvatarSystemRandom())
    private var plan: (key: String, plan: AvatarLipSyncPlan)?
    private let origin = CACurrentMediaTime()
    /// nil until the first frame: a verdict that was already there when the stage appeared (the setting turned on
    /// after a reply) belongs to a turn that is over, so it is not reacted to.
    private var handledVerdictSerial: Int?

    func frame(
        voice: VoiceSessionController, replyText: String?, replyVerdict: AvatarReplyVerdict, course: Course,
        reduceMotion: Bool
    ) -> AvatarFrame {
        let now = CACurrentMediaTime() - origin
        if handledVerdictSerial == nil { handledVerdictSerial = replyVerdict.serial }
        if replyVerdict.serial != handledVerdictSerial {
            handledVerdictSerial = replyVerdict.serial
            // He reacts once the reply has been spoken; the machine holds the reaction until then.
            machine.replyArrived(verdict: replyVerdict.verdict)
        }
        machine.update(phase: voice.phase, now: now)
        if voice.isRecording, let level = voice.inputLevelDBFS() {
            machine.heard(levelDBFS: level, now: now)
        }

        var speech: AvatarSpeechPosition?
        if case .speaking = voice.phase, let playback = voice.replyPlayback, let replyText {
            let key = "\(playback.duration)|\(replyText)"
            if plan?.key != key {
                plan = (key, AvatarLipSync.plan(text: replyText, course: course, duration: playback.duration))
            }
            if let current = plan { speech = AvatarSpeechPosition(plan: current.plan, time: playback.time) }
        }

        var frame = AvatarFrame()
        frame.pose = machine.pose(now: now, speech: speech)
        // Reduce Motion stills the body (breathing, sway, ears, glint). The mouth and brows still change: they
        // carry what he is doing.
        guard !reduceMotion else { return frame }
        idle.advance(to: now)
        frame.leftEarTwitch = idle.twitchingEar == .left
        frame.rightEarTwitch = idle.twitchingEar == .right
        frame.glint = idle.glintProgress
        frame.swayDegrees = AvatarIdleMotion.swayDegrees(at: now)
        frame.breath = AvatarIdleMotion.breathScale(at: now)
        return frame
    }
}

/// The stage: sized from the screen so a small phone keeps room for the transcript and the talk button.
struct AlphonsoAvatarStage: View {
    let voice: VoiceSessionController
    let replyText: String?
    var replyVerdict = AvatarReplyVerdict()
    let course: Course

    var body: some View {
        AlphonsoAvatarView(voice: voice, replyText: replyText, replyVerdict: replyVerdict, course: course)
            .containerRelativeFrame(.vertical) { length, _ in min(max(length * 0.2, 88), 170) }
            .frame(maxWidth: .infinity)
            .padding(.top, 4)
            .background(AlphonsoColor.surface)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

struct AlphonsoAvatarView: View {
    let voice: VoiceSessionController
    let replyText: String?
    let replyVerdict: AvatarReplyVerdict
    let course: Course

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var driver = AvatarDriver()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: scenePhase != .active)) { _ in
            let frame = driver.frame(
                voice: voice, replyText: replyText, replyVerdict: replyVerdict, course: course,
                reduceMotion: reduceMotion)
            AvatarLayersView(frame: frame)
        }
    }
}

/// The 15 layers placed from the manifest rects, in the manifest's draw order.
@MainActor
private struct AvatarLayersView: View {
    let frame: AvatarFrame

    var body: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            ZStack(alignment: .topLeading) {
                layer(AvatarLayers.baseFile, AvatarRect(x: 0, y: 0, w: 1, h: 1), side)
                ear(.left, twitching: frame.leftEarTwitch, side)
                ear(.right, twitching: frame.rightEarTwitch, side)
                ForEach(AvatarViseme.allCases.filter { $0 != .closed }, id: \.self) { shape in
                    if let file = AvatarLayers.mouthFile(shape) {
                        layer(file, AvatarLayers.mouthRect, side)
                            .opacity(frame.pose.mouth == shape ? 1 : 0)
                    }
                }
                .animation(.linear(duration: 0.055), value: frame.pose.mouth)
                ForEach(AvatarBrows.allCases, id: \.self) { brows in
                    layer(AvatarLayers.browsFile(brows), AvatarLayers.browsRect, side)
                        .opacity(frame.pose.brows == brows ? 1 : 0)
                }
                .animation(.easeInOut(duration: 0.14), value: frame.pose.brows)
                if let progress = frame.glint {
                    glint(progress: progress, side)
                }
            }
            .frame(width: side, height: side, alignment: .topLeading)
            .scaleEffect(x: frame.breath.x, y: frame.breath.y, anchor: .bottom)
            .rotationEffect(.degrees(frame.swayDegrees), anchor: .bottom)
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
    }

    private func ear(_ side: AvatarEarSide, twitching: Bool, _ canvas: CGFloat) -> some View {
        let rect = side == .left ? AvatarLayers.earLeftRect : AvatarLayers.earRightRect
        return ZStack(alignment: .topLeading) {
            layer(AvatarLayers.earFile(side, twitching: false), rect, canvas).opacity(twitching ? 0 : 1)
            layer(AvatarLayers.earFile(side, twitching: true), rect, canvas).opacity(twitching ? 1 : 0)
        }
        .animation(.linear(duration: 0.05), value: twitching)
    }

    /// A soft diagonal band of light across the lenses; the glint mask (white = lens) keeps it off the rest.
    private func glint(progress: Double, _ canvas: CGFloat) -> some View {
        let rect = AvatarLayers.glintRect
        let width = canvas * rect.w
        let height = canvas * rect.h
        return ZStack {
            Rectangle()
                .fill(LinearGradient(
                    colors: [.white.opacity(0), .white.opacity(0.65), .white.opacity(0)],
                    startPoint: .leading, endPoint: .trailing))
                .frame(width: width * 0.4, height: height * 2.4)
                .rotationEffect(.degrees(20))
                .offset(x: (progress - 0.5) * width * 1.6)
        }
        .frame(width: width, height: height)
        .clipped()
        .mask {
            if let mask = AvatarArt.image(AvatarLayers.glintMaskFile) {
                Image(uiImage: mask).resizable().luminanceToAlpha()
            }
        }
        .offset(x: canvas * rect.x, y: canvas * rect.y)
    }

    @ViewBuilder
    private func layer(_ file: String, _ rect: AvatarRect, _ canvas: CGFloat) -> some View {
        if let image = AvatarArt.image(file) {
            Image(uiImage: image)
                .resizable()
                .frame(width: canvas * rect.w, height: canvas * rect.h)
                .offset(x: canvas * rect.x, y: canvas * rect.y)
        }
    }
}
