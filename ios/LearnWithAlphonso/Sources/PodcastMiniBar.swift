import SwiftUI
import LearnWithAlphonsoKit

/// The podcast control bar, docked above each tab's content by
/// `View.podcastMiniBar` (below) -- not on the TabView, which is where it
/// was and where the inset gets consumed by the tab bar itself.
///
/// It is only a control surface: the audio lives in PodcastAudioPlayer,
/// held above the view tree, so this bar coming and going never affects
/// playback.
///
/// **Correction (2026-09-30, from a real screenshot the account owner
/// sent):** this comment previously claimed the bar does NOT follow
/// screens pushed over a tab (the lesson player named explicitly). That
/// was already false when found -- `.safeAreaInset`'s visual bar was
/// showing over a pushed LessonPlayerView regardless, the screenshot
/// proved it -- the INSET (the layout-reservation half) just wasn't
/// extending to that pushed destination's own content, so its
/// bottom-pinned primary button (Begin/Check/Continue) landed exactly
/// underneath the already-visible bar. `.podcastMiniBar()` is now
/// applied a second time, directly to LessonPlayerView, in
/// LessonBrowserView.swift's `navigationDestination` closure -- this
/// doesn't add a second bar (only one of {a tab's own root content, its
/// pushed destination} is ever actually on screen inside a
/// NavigationStack at once), it fixes the layout reservation for the
/// one that's showing. The review queue and Profile hub's sheets are a
/// different case -- sheets cover the tab bar and this mini-bar
/// entirely, so they were never affected either way. Still **unverified
/// on hardware** -- see this file's own note further down; re-run
/// device check #12 before trusting this comment any further than the
/// last one.
struct PodcastMiniBar: View {
    let player: PodcastAudioPlayer
    let session: Session
    /// TestFlight feedback (2026-09-29): needed only to resolve a
    /// downloaded copy's local URL for the "Next" button -- see
    /// PodcastAudioPlayer's own doc comment on why the player itself
    /// stays ignorant of the download manager.
    let downloads: PodcastDownloadManager

    @State private var showTranscript = false
    @State private var transcript: String?
    @State private var isLoadingTranscript = false

    var body: some View {
        if let episode = player.episode {
            VStack(spacing: 0) {
                if let message = player.failureMessage {
                    // A failure is stated, with the one action that can fix it. Never a
                    // Pause icon over an episode that is not playing.
                    HStack(spacing: AlphonsoSpacing.sm) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(AlphonsoColor.destructive)
                            .accessibilityHidden(true)
                        Text(message)
                            .font(AlphonsoFont.sans(13))
                            .foregroundStyle(AlphonsoColor.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        Button(PodcastPlaybackCopy.retryTitle) {
                            player.retry(localURL: downloads.localURL(episodeID: episode.id))
                        }
                        .font(AlphonsoFont.sans(13, weight: .semiBold))
                        .tint(AlphonsoColor.moss)
                        .frame(minHeight: 44)
                    }
                    .padding(.horizontal, AlphonsoSpacing.md)
                    .padding(.top, AlphonsoSpacing.sm)
                    .accessibilityElement(children: .combine)
                }
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

                    switch player.control {
                    case .play, .pause:
                        Button {
                            player.toggle()
                        } label: {
                            Image(systemName: player.control == .pause ? "pause.fill" : "play.fill")
                                .foregroundStyle(AlphonsoColor.onPrimary)
                                .padding(AlphonsoSpacing.sm)
                                .background(Circle().fill(AlphonsoColor.moss))
                        }
                        .accessibilityLabel(player.control == .pause ? "Pause" : "Play")
                    case .spinner:
                        // Tapping while loading or buffering cancels to Paused.
                        Button {
                            player.toggle()
                        } label: {
                            ProgressView()
                                .tint(AlphonsoColor.onPrimary)
                                .padding(AlphonsoSpacing.sm)
                                .background(Circle().fill(AlphonsoColor.moss))
                        }
                        .accessibilityLabel("Loading. Double-tap to pause.")
                    case .retry, .none:
                        EmptyView()
                    }

                    // TestFlight feedback (2026-09-29): "when a user finishes a
                    // listen, there is no way to continue to the next lesson."
                    // Hidden entirely (not disabled) when there's nothing next,
                    // matching this bar's own pattern of disappearing rather
                    // than showing an inert control.
                    if let next = player.nextEpisode {
                        Button {
                            player.play(next, localURL: downloads.localURL(episodeID: next.id), queue: player.queue)
                            downloads.markPlayed(episodeID: next.id)
                        } label: {
                            Image(systemName: "forward.end.fill")
                                .foregroundStyle(AlphonsoColor.inkSoft)
                        }
                        .accessibilityLabel("Next episode")
                    }

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
            }
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
                    isLoading: isLoadingTranscript,
                    session: session
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
        if player.machine.phase == .buffering { return PodcastPlaybackCopy.bufferingLabel }
        return format(player.elapsedSeconds) + " / " + format(Double(episode.durationSeconds))
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
    /// Needed only to open a save sheet when a word is tapped.
    let session: Session

    @Environment(\.dismiss) private var dismiss
    /// The word the learner tapped in the transcript, if a save sheet is open.
    @State private var savingWord: SaveWordRequest?

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
                                Text("Tap any word to save it.")
                                    .font(AlphonsoFont.sans(12))
                                    .foregroundStyle(AlphonsoColor.inkSoft)
                                ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, paragraph in
                                    // Episodes are English (the podcast models carry no
                                    // language field), so a tapped word is an English word.
                                    // If episodes ever gain a language, derive the course
                                    // from it and route it through `SavedWordPolicy`.
                                    TappableText(
                                        text: paragraph, color: AlphonsoColor.ink, course: "en"
                                    ) { savingWord = $0 }
                                    .font(AlphonsoFont.sans(15))
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
        .sheet(item: $savingWord) { request in
            SaveWordSheet(request: request, session: session)
        }
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
    func podcastMiniBar(player: PodcastAudioPlayer, session: Session, downloads: PodcastDownloadManager) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            PodcastMiniBar(player: player, session: session, downloads: downloads)
        }
    }
}
