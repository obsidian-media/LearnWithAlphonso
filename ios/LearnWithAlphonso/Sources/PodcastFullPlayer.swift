import SwiftUI
import LearnWithAlphonsoKit

/// The full-screen player: the room behind a navy sheet, Alphonso in the corner, the seek bar, back 15 / play /
/// forward 30 and the transcript. A control surface over the same `PodcastAudioPlayer` as the mini bar, so opening
/// or closing it never touches playback. Compiles in CI's ios-app-build; look at it on a device.
struct PodcastFullPlayer: View {
    let player: PodcastAudioPlayer
    let episode: PodcastEpisode
    let onTranscript: () -> Void

    @Environment(\.dismiss) private var dismiss

    private var duration: Double { Double(episode.durationSeconds) }

    var body: some View {
        ZStack {
            AlphonsoColor.mossDeep.ignoresSafeArea()
            if let room = LessonArt.room("radio") {
                Image(uiImage: room).resizable().scaledToFill().blur(radius: 18).opacity(0.25).ignoresSafeArea()
                    .accessibilityHidden(true)
            }
            ScrollView {
                VStack(spacing: AlphonsoSpacing.md) {
                    HStack {
                        Button { dismiss() } label: {
                            Image(systemName: "chevron.down").foregroundStyle(AlphonsoColor.onPrimary)
                                .frame(width: AlphonsoSpacing.minTouchTarget, height: AlphonsoSpacing.minTouchTarget)
                        }
                        .accessibilityLabel("Minimise player")
                        Spacer()
                        Button("Close") {
                            player.close()
                            dismiss()
                        }
                        .foregroundStyle(AlphonsoColor.onPrimary)
                        .frame(minHeight: AlphonsoSpacing.minTouchTarget)
                        .accessibilityLabel("Stop and close player")
                    }

                    ZStack(alignment: .bottomTrailing) {
                        if let room = LessonArt.room("radio") {
                            Image(uiImage: room).resizable().scaledToFill()
                        }
                        Image(MascotArt.assetName(for: player.isPlaying ? .lessonComplete : .learnGreeting))
                            .resizable().scaledToFit().frame(width: 130)
                    }
                    .frame(width: 260, height: 260)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .accessibilityHidden(true)

                    Text(episode.title)
                        .dsText(.title)
                        .foregroundStyle(AlphonsoColor.onPrimary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Alphonso" + (episode.aiNarrated ? " \u{00B7} \(PodcastLabel.aiNarrated)" : ""))
                        .dsText(.footnote)
                        .foregroundStyle(AlphonsoColor.onPrimary)

                    if let message = player.failureMessage {
                        Text(message).dsText(.footnote).foregroundStyle(AlphonsoColor.emberSoft)
                            .multilineTextAlignment(.center)
                    } else if duration > 0 {
                        Slider(
                            value: Binding(
                                get: { min(max(player.elapsedSeconds, 0), duration) },
                                set: { player.seek(to: $0) }
                            ),
                            in: 0...duration
                        )
                        .tint(AlphonsoColor.ember)
                        .accessibilityLabel("Playback position")
                        .accessibilityValue("\(ListenShelf.clock(Int(player.elapsedSeconds))) of \(ListenShelf.clock(episode.durationSeconds))")
                        HStack {
                            Text(ListenShelf.clock(Int(player.elapsedSeconds)))
                            Spacer()
                            Text("-" + ListenShelf.clock(episode.durationSeconds - Int(player.elapsedSeconds)))
                        }
                        .dsText(.caption)
                        .foregroundStyle(AlphonsoColor.onPrimary)
                        .monospacedDigit()
                        .accessibilityHidden(true)
                    }

                    HStack(spacing: AlphonsoSpacing.lg) {
                        Button { player.seek(to: max(0, player.elapsedSeconds - 15)) } label: {
                            Image(systemName: "gobackward.15").font(.title2).foregroundStyle(AlphonsoColor.onPrimary)
                                .frame(width: 56, height: 56)
                        }
                        .accessibilityLabel("Back 15 seconds")
                        Button { player.toggle() } label: {
                            Image(systemName: player.control == .pause ? "pause.fill" : "play.fill")
                                .font(.title).foregroundStyle(AlphonsoColor.onAccent)
                                .frame(width: 72, height: 72)
                                .background(Circle().fill(AlphonsoColor.ember))
                        }
                        .accessibilityLabel(player.control == .pause ? "Pause" : "Play")
                        Button { player.seek(to: min(duration, player.elapsedSeconds + 30)) } label: {
                            Image(systemName: "goforward.30").font(.title2).foregroundStyle(AlphonsoColor.onPrimary)
                                .frame(width: 56, height: 56)
                        }
                        .accessibilityLabel("Forward 30 seconds")
                    }

                    Button(action: onTranscript) {
                        Label("Transcript", systemImage: "text.alignleft")
                            .dsText(.footnote)
                            .foregroundStyle(AlphonsoColor.onPrimary)
                            .padding(.horizontal, AlphonsoSpacing.md)
                            .frame(minHeight: AlphonsoSpacing.minTouchTarget)
                            .background(Capsule().fill(AlphonsoColor.onPrimary.opacity(0.15)))
                    }
                    .accessibilityLabel("Show transcript")
                }
                .padding(AlphonsoSpacing.md)
            }
        }
    }
}
