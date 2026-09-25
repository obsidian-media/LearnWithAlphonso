import SwiftUI
import LearnWithAlphonsoKit

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
    let session: Session

    @State private var showTranscript = false
    @State private var transcript: String?
    @State private var isLoadingTranscript = false

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

                // The accessibility affordance, always present rather than
                // hidden when an episode has no transcript: hiding it would
                // make the gap invisible instead of stated.
                Button {
                    showTranscript = true
                } label: {
                    Image(systemName: "text.alignleft")
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
                .accessibilityLabel("Show transcript")

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
            .sheet(isPresented: $showTranscript) {
                PodcastTranscriptSheet(
                    title: episode.title,
                    transcript: transcript,
                    isLoading: isLoadingTranscript
                )
            }
            // Fetched when the sheet opens, keyed on the episode so switching
            // episodes while the sheet is open reloads rather than showing
            // the previous one's text.
            .task(id: TranscriptRequest(episodeID: episode.id, isOpen: showTranscript)) {
                await loadTranscript(episodeID: episode.id)
            }
        }
    }

    /// Identity for the fetch task: both the episode and whether the sheet is
    /// open, so closing and reopening does not refetch but switching episodes
    /// does.
    private struct TranscriptRequest: Equatable {
        let episodeID: String
        let isOpen: Bool
    }

    private func loadTranscript(episodeID: String) async {
        guard showTranscript, let client = makePodcastClient(session: session) else { return }
        isLoadingTranscript = true
        transcript = (try? await client.fetchTranscript(episodeID: episodeID)) ?? nil
        isLoadingTranscript = false
    }

    private func progressLabel(for episode: PodcastEpisode) -> String {
        format(player.elapsedSeconds) + " / " + format(Double(episode.durationSeconds))
    }

    private func format(_ seconds: Double) -> String {
        let safe = seconds.isFinite && seconds > 0 ? Int(seconds.rounded()) : 0
        return String(format: "%d:%02d", safe / 60, safe % 60)
    }
}

/// An episode's transcript, presented over the app while it plays.
///
/// The accessibility artefact for the podcast library on iOS. The player
/// carries no captions -- timed cues need forced alignment against the
/// audio, a separate problem -- so text on screen is what makes an episode
/// available to deaf and hard-of-hearing learners at all.
private struct PodcastTranscriptSheet: View {
    let title: String
    let transcript: String?
    let isLoading: Bool

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading transcript…")
                        .tint(AlphonsoColor.moss)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    let paragraphs = PodcastTranscript.paragraphs(transcript ?? "")
                    if paragraphs.isEmpty {
                        // Said plainly rather than rendered blank: an episode
                        // without a transcript is inaccessible to deaf
                        // learners, which is a fact about the content.
                        ContentUnavailableView {
                            Label("No transcript", systemImage: "text.alignleft")
                        } description: {
                            Text("This episode doesn't have a transcript yet.")
                        }
                    } else {
                        ScrollView {
                            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm + 4) {
                                ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, paragraph in
                                    Text(paragraph)
                                        .font(AlphonsoFont.sans(15))
                                        .foregroundStyle(AlphonsoColor.ink)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                            .padding(AlphonsoSpacing.md)
                        }
                    }
                }
            }
            .background(AlphonsoColor.surface)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .tint(AlphonsoColor.moss)
                }
            }
        }
        .tint(AlphonsoColor.moss)
    }
}

extension View {
    /// Docks the podcast mini-bar above this view's own bottom edge.
    ///
    /// Applied to each tab's ROOT CONTENT, never to the TabView.
    ///
    /// It was on the TabView, under a comment asserting the bar would "sit
    /// above the tab bar and push content up". Device check #12 found the
    /// opposite: the inset is consumed inside the tab bar's own region and
    /// the bar overlaps it. That comment was reasoning rather than
    /// observation, and it told the next reader the broken arrangement was
    /// correct -- which is worse than the overlap itself.
    ///
    /// Applied per tab, the inset belongs to that tab's content, so the bar
    /// sits between the content and the tab bar.
    ///
    /// **Unverified on hardware at the time of writing.** swift.exe is
    /// blocked by an Application Control policy on the development machine,
    /// so this was not run locally, and no automated check can see layout.
    /// Re-run device check #12 before trusting this comment any further
    /// than the last one.
    func podcastMiniBar(player: PodcastAudioPlayer, session: Session) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            PodcastMiniBar(player: player, session: session)
        }
    }
}
