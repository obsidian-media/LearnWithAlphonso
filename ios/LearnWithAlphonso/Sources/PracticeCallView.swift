import SwiftUI
import UIKit
import LearnWithAlphonsoKit

/// The Practice speaking session as a full-screen call with Alphonso: his room behind him, a call bar with a timer,
/// a "You" tile with the learner's voice level, one live caption, and the call controls. The conversation itself
/// (bubbles, hints, "New conversation") lives in a bottom sheet the caller provides. The logic (room choice, caption,
/// clock, bars, state labels) is the Kit's AvatarCall.swift; this file only draws it.
///
/// Decorative: Alphonso, the room and the "You" tile are hidden from VoiceOver. The caption is announced as it
/// changes, and the sheet keeps the whole transcript accessible.

/// The rooms, decoded once from the `AlphonsoScenes` bundle folder.
@MainActor
private enum RoomArt {
    private static var cache: [String: UIImage] = [:]

    static func image(_ name: String) -> UIImage? {
        if let hit = cache[name] { return hit }
        let path = Bundle.main.bundlePath + "/AlphonsoScenes/" + name + ".webp"
        guard let loaded = UIImage(contentsOfFile: path) else { return nil }
        let image = loaded.preparingForDisplay() ?? loaded
        cache[name] = image
        return image
    }
}

struct PracticeCallView<Sheet: View>: View {
    let title: String
    /// Who is on the call: the name in the call bar, his art and his default room. Alphonso unless told otherwise.
    var kit: CharacterKit = .alphonso
    /// The hold-to-talk button's spoken label.
    var talkLabel = "Hold to talk"
    let scenarioID: String
    let voice: VoiceSessionController
    let course: Course
    let turns: [ChatMessage]
    let replyVerdict: AvatarReplyVerdict
    /// A problem to show over the call (a playback notice, a TutorError message).
    let notice: String?
    let onPress: () -> Void
    let onEnd: () -> Void
    /// Something that belongs on the call itself (a campaign's "Continue" button), shown above the caption.
    var extra: AnyView?
    @ViewBuilder let sheet: () -> Sheet

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.alphonsoDS) private var ds
    @State private var showSheet = false
    @State private var mode: AvatarMode = .idle
    @State private var startedAt = Date()
    @State private var callID = UUID()

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = proxy.size.height
            // The square is held to 72% of the height, so on a short phone the caption and controls stay clear of
            // his mouth.
            let side = min(1.28 * width, 0.72 * height)
            // The room is a background, not a ZStack child: a scaledToFill image inside the stack would size the
            // stack to the picture's aspect and push the call bar, tiles and caption off both screen edges.
            ZStack {
                AlphonsoAvatarView(
                    voice: voice, replyText: turns.last(where: { $0.role == "assistant" })?.content,
                    replyVerdict: replyVerdict, course: course, kit: kit, onModeChange: { mode = $0 }
                )
                .frame(width: side, height: side)
                .position(x: width / 2, y: height * 0.15 + side / 2)
                .allowsHitTesting(false)
                .accessibilityHidden(true)

                VStack(spacing: 0) {
                    callBar
                    HStack {
                        Spacer()
                        youTile
                    }
                    .padding(.top, 8)
                    Spacer(minLength: 0)
                    if let message = notice ?? voice.failure?.userMessage() ?? microphoneMessage {
                        pill(message, color: ds.wrongInk)
                            .padding(.bottom, 8)
                    }
                    if let extra { extra.padding(.bottom, 10) }
                    caption
                    statePill
                        .padding(.top, 10)
                    if voice.isHandsFreeOn, let line = HandsFreeCopy.statusLine(voice.handsFreeStatus) {
                        // A paused hands-free call is a safety stop: it gets its own glass pill and a pause mark, so it
                        // cannot be missed over the picture.
                        let paused: Bool = { if case .paused = voice.handsFreeStatus { return true } else { return false } }()
                        HStack(spacing: AlphonsoDS.Space.s2) {
                            if paused {
                                Image(systemName: "pause.fill").dsText(.caption).accessibilityHidden(true)
                            }
                            Text(line).multilineTextAlignment(.center)
                        }
                        .dsText(.footnote)
                        .foregroundStyle(ds.onHero)
                        .padding(.horizontal, AlphonsoDS.Space.s3)
                        .padding(.vertical, AlphonsoDS.Space.s2)
                        .background(paused ? glassStrong : glass, in: Capsule())
                        .padding(.top, 8)
                        .accessibilityAddTraits(.updatesFrequently)
                    }
                    controls
                        .padding(.top, 14)
                        .padding(.bottom, 8)
                }
                .padding(.horizontal, 18)
            }
            .frame(width: width, height: height)
        }
        .background { room }
        .background(Color.black)
        .sheet(isPresented: $showSheet) { conversationSheet }
        // The call-start sound, once per call (keyed, so a re-appearance cannot repeat it); while he speaks, no effect
        // plays over him.
        .onAppear {
            Analytics.track(.practiceCallStarted, ["scenario_id": scenarioID])
            SoundEffectsPlayer.shared.registerVoiceProbe("call") { [voice] in
                if case .speaking = voice.phase { return true }
                return false
            }
            SoundEffectsPlayer.shared.play(.callStart, key: "call-\(callID)")
        }
        .onDisappear { SoundEffectsPlayer.shared.unregisterVoiceProbe("call") }
    }

    /// The microphone is off in Settings or would not start: the classic screens say so under the button.
    private var microphoneMessage: String? {
        if voice.microphoneUnavailable { return VoiceCopy.microphoneOff }
        if voice.recorderStartFailed { return VoiceCopy.microphoneCouldNotStart }
        return nil
    }

    // MARK: - Room

    private var room: some View {
        let room = CallScenes.room(for: scenarioID, withArt: CallScenes.scenariosWithArt.union(PracticeHub.sceneRoomNames), fallback: kit.defaultRoom)
        let dark = colorScheme == .dark
        let name = dark ? room.dark : room.light
        return ZStack {
            if let image = RoomArt.image(name) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                ds.surface
            }
            if dark && room.dimInDark {
                ds.hero.opacity(CallScenes.eveningOverlayOpacity).blendMode(.multiply)
            }
            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.28), location: 0),
                    .init(color: .clear, location: 0.18),
                    .init(color: .clear, location: 0.55),
                    .init(color: .black.opacity(0.5), location: 1),
                ],
                startPoint: .top, endPoint: .bottom)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    // MARK: - Call bar

    private var callBar: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(kit.displayName)
                    .dsText(.title)
                HStack(spacing: AlphonsoDS.Space.s2 - 2) {
                    Circle()
                        .fill(mode == .speaking ? ds.heart : ds.inkFaint)
                        .frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                    Text(title)
                        .dsText(.footnote)
                        .lineLimit(1)
                }
            }
            .foregroundStyle(ds.onHero)
            .shadow(color: .black.opacity(0.35), radius: 3, y: 1)
            Spacer()
            TimelineView(.periodic(from: startedAt, by: 1)) { context in
                Text(CallClock.format(seconds: Int(context.date.timeIntervalSince(startedAt))))
                    .dsText(.footnote)
                    .monospacedDigit()
                    .foregroundStyle(ds.onHero)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 3)
                    .background(glass, in: Capsule())
            }
            .accessibilityLabel("Call time")
        }
    }

    private var glass: Color { ds.heroB.opacity(0.46) }
    private var glassStrong: Color { ds.heroB.opacity(0.62) }

    // MARK: - You tile

    private var youTile: some View {
        let recording = voice.isRecording
        return VStack(spacing: 8) {
            // Real metering while the learner holds the button (the recorder's average power); resting bars otherwise.
            TimelineView(.animation(minimumInterval: 1.0 / 20.0, paused: !recording)) { _ in
                let level = recording ? voice.inputLevelDBFS() : nil
                HStack(spacing: 3) {
                    ForEach(0..<CallLevel.barCount, id: \.self) { index in
                        Capsule()
                            .fill(.white.opacity(0.85))
                            .frame(width: 5, height: CallLevel.barHeight(dBFS: level, index: index))
                    }
                }
                .frame(height: CallLevel.maxHeight)
            }
            Text("You")
                .dsText(.caption)
                .foregroundStyle(ds.onHero.opacity(0.9))
        }
        .frame(width: 86, height: 116)
        .background(glassStrong, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(recording ? ds.right : .white.opacity(0.18), lineWidth: recording ? 2 : 1)
        )
        .accessibilityHidden(true)
    }

    // MARK: - Caption

    @ViewBuilder
    private var caption: some View {
        if let caption = CallCaptionRules.caption(turns: turns, isRecording: voice.isRecording) {
            let words = caption.text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
            // Ticks only while his words are lighting up with the audio; a still caption costs no frames.
            TimelineView(.animation(minimumInterval: 1.0 / 15.0, paused: !wordsFollowAudio(caption))) { _ in
                let lit = litWords(count: words.count, caption: caption)
                words.enumerated().reduce(Text("")) { text, item in
                    text + Text(item.element + " ")
                        .foregroundColor((caption.mine ? ds.rightTint : ds.onHero)
                            .opacity(item.offset < lit ? 1 : 0.55))
                }
                .dsText(.headline)
                .multilineTextAlignment(.center)
                // At most four lines on screen, so a long reply never climbs over his mouth on a small phone. The
                // whole text is in the VoiceOver label and in the sheet.
                .lineLimit(4)
                .shadow(color: .black.opacity(0.55), radius: 4, y: 1)
                .frame(maxWidth: .infinity)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(caption.text)
            .onChange(of: caption.text) { _, text in
                UIAccessibility.post(notification: .announcement, argument: text)
            }
        } else {
            Color.clear.frame(height: 1)
        }
    }

    private func wordsFollowAudio(_ caption: CallCaption) -> Bool {
        guard !caption.mine, case .speaking = voice.phase else { return false }
        return true
    }

    /// Words light up with the audio while he speaks the caption; otherwise the whole caption is lit.
    private func litWords(count: Int, caption: CallCaption) -> Int {
        guard !caption.mine, case .speaking = voice.phase, let playback = voice.replyPlayback, playback.duration > 0 else {
            return count
        }
        return CallCaptionRules.litWords(wordCount: count, progress: playback.time / playback.duration)
    }

    private var statePill: some View {
        Text(mode.callLabel.uppercased())
            .dsText(.caption)
            .tracking(0.5)
            .foregroundStyle(ds.onHero)
            .padding(.horizontal, 10)
            .padding(.vertical, 2)
            .background(glass, in: Capsule())
            .accessibilityHidden(true)
    }

    private func pill(_ text: String, color: Color) -> some View {
        Text(text)
            .dsText(.caption)
            .foregroundStyle(color)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.92), in: Capsule())
    }

    // MARK: - Controls

    private var controls: some View {
        HStack(spacing: 26) {
            Button { showSheet = true } label: {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .dsText(.title)
                    .foregroundStyle(ds.onHero)
                    .frame(width: 54, height: 54)
                    .background(glassStrong, in: Circle())
            }
            .accessibilityLabel("Show the conversation")

            if voice.isHandsFreeOn {
                handsFreeButton
            } else {
                HoldToTalkButton(
                    isRecording: voice.isRecording,
                    idleColor: ds.onHero,
                    recordingColor: ds.right,
                    iconColor: ds.hero,
                    accessibilityLabel: talkLabel,
                    onPress: onPress,
                    onRelease: { voice.pressEnded() }
                )
                .scaleEffect(78.0 / 72.0)
                .frame(width: 78, height: 78)
                // One turn at a time: while the reply is being made the button waits.
                .opacity(voice.isBusy ? 0.55 : 1)
                .allowsHitTesting(!voice.isBusy)
            }

            Button {
                SoundEffectsPlayer.shared.play(.callEnd)
                onEnd()
            } label: {
                Image(systemName: "phone.down.fill")
                    .dsText(.title)
                    .foregroundStyle(ds.onWrong)
                    .frame(width: 54, height: 54)
                    .background(ds.wrong, in: Circle())
            }
            .accessibilityLabel("End the call")
        }
        .frame(maxWidth: .infinity)
    }

    /// Hands-free has no button to hold: one Pause or Resume button takes its place.
    private var handsFreeButton: some View {
        let paused: Bool = { if case .paused = voice.handsFreeStatus { return true } else { return false } }()
        return Button {
            voice.toggleHandsFreePause()
        } label: {
            Image(systemName: paused ? "play.fill" : "pause.fill")
                .dsText(.display)
                .foregroundStyle(ds.hero)
                .frame(width: 78, height: 78)
                .background(ds.onHero, in: Circle())
        }
        .accessibilityLabel(paused ? HandsFreeCopy.resume : HandsFreeCopy.pause)
        .accessibilityIdentifier("hectorHandsFreePause")
        // A pause is a safety stop the learner must hear about; updatesFrequently does not announce it.
        .onChange(of: voice.handsFreeStatus) { _, new in
            if case .paused = new, let line = HandsFreeCopy.statusLine(new) {
                AccessibilityNotification.Announcement(line).post()
            }
        }
    }

    // MARK: - Sheet

    private var conversationSheet: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Conversation")
                    .dsText(.title)
                    .foregroundStyle(ds.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button("Back to call") { showSheet = false }
                    .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 8)
            sheet()
        }
        .background(ds.surface)
        .presentationDetents([.large])
    }
}
