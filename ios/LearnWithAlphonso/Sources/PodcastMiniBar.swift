import SwiftUI

/// The podcast control bar, attached to the TabView with
/// `.safeAreaInset(edge: .bottom)` so it sits above the tab bar without
/// overlapping content or being overlapped by it.
///
/// It is only a control surface: the audio lives in PodcastAudioPlayer,
/// held above the view tree, so this bar coming and going never affects
/// playback.
///
/// It does **not** follow screens presented over the tabs (the lesson
/// player, the review queue, the Profile hub's sheets). That is intended --
/// a control bar floating over a lesson would be worse -- and it is on the
/// device checklist rather than left to be discovered on a screen.
struct PodcastMiniBar: View {
    let player: PodcastAudioPlayer

    var body: some View {
        if let episode = player.episode {
            HStack(spacing: AlphonsoSpacing.sm + 2) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(episode.title)
                        .font(AlphonsoFont.sans(14, weight: .semiBold))
                        .foregroundStyle(AlphonsoColor.ink)
                        .lineLimit(1)
                    Text(progressLabel(for: episode))
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                        .monospacedDigit()
                }
                Spacer(minLength: 0)

                Button {
                    player.toggle()
                } label: {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                        .foregroundStyle(AlphonsoColor.onPrimary)
                        .padding(AlphonsoSpacing.sm)
                        .background(Circle().fill(AlphonsoColor.moss))
                }
                .accessibilityLabel(player.isPlaying ? "Pause" : "Play")

                Button {
                    player.close()
                } label: {
                    Image(systemName: "xmark")
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
                .accessibilityLabel("Close player")
            }
            .padding(.horizontal, AlphonsoSpacing.md)
            .padding(.vertical, AlphonsoSpacing.sm)
            .background(AlphonsoColor.parchment)
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(AlphonsoColor.hairline)
                    .frame(height: 1)
            }
        }
    }

    private func progressLabel(for episode: PodcastEpisode) -> String {
        format(player.elapsedSeconds) + " / " + format(Double(episode.durationSeconds))
    }

    private func format(_ seconds: Double) -> String {
        let safe = seconds.isFinite && seconds > 0 ? Int(seconds.rounded()) : 0
        return String(format: "%d:%02d", safe / 60, safe % 60)
    }
}
