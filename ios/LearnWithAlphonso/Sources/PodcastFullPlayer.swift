import SwiftUI
import LearnWithAlphonsoKit

/// The full-screen player: the room behind a navy sheet, Alphonso in the corner, the seek bar, back 15 / play /
/// forward 30 and the transcript. A control surface over the same `PodcastAudioPlayer` as the mini bar, so opening
/// or closing it never touches playback. Compiles in CI's ios-app-build; look at it on a device.
struct PodcastFullPlayer: View {
    let player: PodcastAudioPlayer
    let episode: PodcastEpisode
    /// The episode's transcript once read, for the follow-along; nil while loading or when it has none.
    let transcript: String?
    let onTranscript: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Timed lines, only while they still spell the transcript word for word; otherwise today's plain transcript.
    private var lines: [TimedLine]? {
        PodcastTimings.lines(PodcastTimingsStore.lines(for: episode.id), matching: transcript)
    }

    private var duration: Double { Double(episode.durationSeconds) }

    private var sleepLabel: String {
        switch player.sleep.choice {
        case .off: return "Sleep"
        case .endOfEpisode: return "End of episode"
        default: return "Sleep timer on"
        }
    }

    private var sleepAccessibilityLabel: String {
        player.sleep.choice == .off ? "Sleep timer, off" : "Sleep timer, \(player.sleep.choice.label)"
    }

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

                    if let lines {
                        // With timings the art shrinks to a header so the transcript has the room, as in the mock.
                        HStack(alignment: .bottom, spacing: AlphonsoSpacing.sm) {
                            ZStack {
                                if let room = LessonArt.room("radio") {
                                    Image(uiImage: room).resizable().scaledToFill()
                                }
                            }
                            .frame(width: 96, height: 96)
                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                            .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
                                Text(episode.title)
                                    .dsText(.title)
                                    .foregroundStyle(AlphonsoColor.onPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text("Alphonso" + (episode.aiNarrated ? " \u{00B7} \(PodcastLabel.aiNarrated)" : ""))
                                    .dsText(.footnote)
                                    .foregroundStyle(AlphonsoColor.onPrimary)
                            }
                            Spacer(minLength: 0)
                        }
                        PodcastTimedTranscript(
                            lines: lines,
                            elapsed: player.elapsedSeconds,
                            reduceMotion: reduceMotion,
                            onSeek: { player.seek(to: $0) }
                        )
                        .frame(minHeight: 220)
                    } else {
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
                    }

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

                    HStack(spacing: AlphonsoSpacing.sm) {
                        Menu {
                            ForEach(SleepChoice.allCases, id: \.self) { choice in
                                Button {
                                    player.setSleep(choice)
                                } label: {
                                    if player.sleep.choice == choice {
                                        Label(choice.label, systemImage: "checkmark")
                                    } else {
                                        Text(choice.label)
                                    }
                                }
                            }
                        } label: {
                            Label(sleepLabel, systemImage: "moon.zzz")
                                .dsText(.footnote)
                                .foregroundStyle(AlphonsoColor.onPrimary)
                                .padding(.horizontal, AlphonsoSpacing.md)
                                .frame(minHeight: AlphonsoSpacing.minTouchTarget)
                                .background(Capsule().fill(AlphonsoColor.onPrimary.opacity(0.15)))
                        }
                        .accessibilityLabel(sleepAccessibilityLabel)

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
                }
                .padding(AlphonsoSpacing.md)
            }
        }
    }
}

/// The timing file bundled with the app (PodcastTimings.json): episode id to its timed lines. Read once, lazily.
enum PodcastTimingsStore {
    private static let all: [String: [TimedLine]] = {
        guard let url = Bundle.main.url(forResource: "PodcastTimings", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return [:] }
        return PodcastTimings.decode(data)
    }()

    static func lines(for episodeID: String) -> [TimedLine]? { all[episodeID] }
}

/// The transcript, line by line, following the audio: the line being spoken is bright, the rest dimmed, the current
/// one scrolls into view (without animation under Reduce Motion) and tapping any line seeks to its start.
struct PodcastTimedTranscript: View {
    let lines: [TimedLine]
    let elapsed: Double
    let reduceMotion: Bool
    let onSeek: (Double) -> Void

    var body: some View {
        let active = PodcastTimings.activeIndex(lines, at: elapsed)
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                        Button { onSeek(line.s) } label: {
                            Text(line.t)
                                .dsText(.body)
                                .foregroundStyle(AlphonsoColor.onPrimary.opacity(index == active ? 1 : 0.55))
                                .multilineTextAlignment(.leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, line.p && index > 0 ? AlphonsoSpacing.sm : 0)
                        }
                        .buttonStyle(.plain)
                        .id(index)
                        .accessibilityAddTraits(index == active ? .isSelected : [])
                        .accessibilityHint("Plays from here")
                    }
                }
                .padding(.vertical, AlphonsoSpacing.md)
            }
            .onChange(of: active) { _, newValue in
                guard newValue >= 0 else { return }
                if reduceMotion {
                    proxy.scrollTo(newValue, anchor: .center)
                } else {
                    withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(newValue, anchor: .center) }
                }
            }
        }
    }
}
