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
    /// Retry and Next pass the real connectivity, so an offline tap on an episode that
    /// is not downloaded fails at once (the machine's fast path) instead of spinning.
    let networkMonitor: NetworkMonitor

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var showTranscript = false
    @State private var showFull = false
    @State private var transcript: String?
    @State private var isLoadingTranscript = false
    /// Nil until the folders are read; the active course stands in, never a fixed one.
    @State private var transcriptCourse: String?
    /// The episode's quiz, offered once it has played to its end (and only if it has one the learner can see).
    @State private var quizOffer: PodcastQuizOffer?
    @State private var showQuiz = false

    var body: some View {
        if let episode = player.episode {
            VStack(spacing: 0) {
                if let message = player.failureMessage {
                    // A failure is stated, with the one action that can fix it. Never a
                    // Pause icon over an episode that is not playing.
                    HStack(spacing: AlphonsoDS.Space.s2) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(ds.wrongInk)
                            .accessibilityHidden(true)
                        Text(message)
                            .dsText(.footnote)
                            .foregroundStyle(ds.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        Button(PodcastPlaybackCopy.retryTitle) {
                            player.retry(
                                localURL: downloads.localURL(episodeID: episode.id),
                                isOnline: networkMonitor.isConnected
                            )
                        }
                        .dsText(.footnote)
                        .tint(ds.choice)
                        .frame(minHeight: AlphonsoDS.Space.minTouch)
                    }
                    .padding(.horizontal, AlphonsoDS.Space.s4)
                    .padding(.vertical, AlphonsoDS.Space.s2)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
                    .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
                    .padding(.horizontal, AlphonsoDS.Space.s3)
                    .padding(.bottom, AlphonsoDS.Space.s1)
                    .accessibilityElement(children: .combine)
                }
                if player.machine.phase == .finished, let offer = quizOffer {
                    quizOfferRow(offer: offer)
                }
                // Round 6.1 "mini player": a navy pill with the room as artwork, the title, the minutes left, a gold
                // play button and a thin gold progress line along the bottom. A failure or a quiz offer above it
                // is a card of its own.
                HStack(spacing: AlphonsoDS.Space.s3) {
                    Button {
                        showFull = true
                    } label: {
                        HStack(spacing: AlphonsoDS.Space.s3) {
                            Image(uiImage: LessonArt.room("radio") ?? UIImage())
                                .resizable()
                                .scaledToFill()
                                .frame(width: AlphonsoDS.Space.s12, height: AlphonsoDS.Space.s12)
                                .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(episode.title)
                                    .dsText(.footnote)
                                    .foregroundStyle(ds.onHero)
                                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 1)
                                    .fixedSize(horizontal: false, vertical: dynamicTypeSize.isAccessibilitySize)
                                Text(progressLabel(for: episode))
                                    .dsText(.caption)
                                    .foregroundStyle(ds.onHeroSoft)
                                    .monospacedDigit()
                            }
                            Spacer(minLength: 0)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Open player: \(episode.title)")

                    switch player.control {
                    case .play, .pause:
                        Button {
                            player.toggle()
                        } label: {
                            Image(systemName: player.control == .pause ? "pause.fill" : "play.fill")
                                .foregroundStyle(ds.onAction)
                                .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                                .background(Circle().fill(ds.action))
                        }
                        .accessibilityLabel(player.control == .pause ? "Pause" : "Play")
                    case .spinner:
                        // Tapping while loading or buffering cancels to Paused.
                        Button {
                            player.toggle()
                        } label: {
                            ProgressView()
                                .tint(ds.onAction)
                                .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                                .background(Circle().fill(ds.action))
                        }
                        .accessibilityLabel("Loading. Double-tap to pause.")
                    case .retry, .none:
                        EmptyView()
                    }

                }
                .padding(.leading, AlphonsoDS.Space.s2)
                .padding(.trailing, AlphonsoDS.Space.s3 + 2)
                .padding(.vertical, AlphonsoDS.Space.s2)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.hero))
                .overlay(alignment: .bottom) { progressLine(for: episode) }
                .dsElevation(AlphonsoDS.Elevation.floating, line: ds.line)
                .padding(.horizontal, AlphonsoDS.Space.s3)
                .padding(.vertical, AlphonsoDS.Space.s1)
            }
            // A sheet, not a full-screen cover: swiping down dismisses it to the mini bar, the standard gesture.
            .sheet(isPresented: $showFull) {
                PodcastFullPlayer(
                    player: player,
                    episode: episode,
                    transcript: transcript,
                    onTranscript: {
                        showFull = false
                        showTranscript = true
                    },
                    // The next episode, when there is one: moved here from the bar (the bar is art, title, time left, play).
                    onNext: player.nextEpisode.map { next in
                        {
                            player.play(
                                next,
                                localURL: downloads.localURL(episodeID: next.id),
                                queue: player.queue,
                                isOnline: networkMonitor.isConnected
                            )
                            downloads.markPlayed(episodeID: next.id)
                        }
                    }
                )
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showTranscript) {
                PodcastTranscriptSheet(
                    title: episode.title,
                    transcript: transcript,
                    course: transcriptCourse ?? ActiveCoursePreference.load(for: session.userID, from: .standard).wireCode,
                    isLoading: isLoadingTranscript,
                    session: session
                )
            }
            .sheet(isPresented: $showQuiz) {
                if let offer = quizOffer {
                    PodcastQuizSheet(title: episode.title, episodeID: episode.id, offer: offer, session: session) { result in
                        // The offer's "best" label follows a better run without another read.
                        quizOffer = PodcastQuizOffer(
                            questions: offer.questions,
                            best: PodcastQuizBest(correct: result.bestCorrect, xp: result.bestXP)
                        )
                    }
                }
            }
            // The quiz is read when an episode finishes, keyed on the episode and on finishing, so playing again
            // (or another episode) clears the offer instead of leaving a stale one.
            .task(id: QuizOfferRequest(episodeID: episode.id, isFinished: player.machine.phase == .finished)) {
                await loadQuizOffer(episode: episode)
            }
            // Fetched when the sheet opens, keyed on the episode so switching
            // episodes while the sheet is open reloads rather than showing
            // the previous one's text.
            .task(id: TranscriptRequest(episodeID: episode.id, isOpen: showTranscript || showFull)) {
                await loadTranscript(episode: episode)
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

    private struct QuizOfferRequest: Equatable {
        let episodeID: String
        let isFinished: Bool
    }

    private func loadQuizOffer(episode: PodcastEpisode) async {
        guard player.machine.phase == .finished, let client = makePodcastClient(session: session) else {
            quizOffer = nil
            showQuiz = false
            return
        }
        // No offer is the quiet failure: the episode itself is unaffected by a quiz that cannot be read.
        let offer = try? await client.fetchQuiz(episodeID: episode.id)
        guard !Task.isCancelled else { return }
        quizOffer = offer
    }

    private func quizOfferRow(offer: PodcastQuizOffer) -> some View {
        HStack(spacing: AlphonsoDS.Space.s2) {
            VStack(alignment: .leading, spacing: 2) {
                Text(PodcastQuizCopy.offerTitle)
                    .dsText(.footnote)
                    .foregroundStyle(ds.ink)
                Text(PodcastQuizCopy.offerDetail(questionCount: offer.questions.count, best: offer.best))
                    .dsText(.caption)
                    .foregroundStyle(ds.inkSoft)
            }
            Spacer(minLength: 0)
            Button("Take the quiz") { showQuiz = true }
                .buttonStyle(.dsButton(.primary, compact: true, fullWidth: false))
        }
        .padding(.horizontal, AlphonsoDS.Space.s4)
        .padding(.vertical, AlphonsoDS.Space.s2)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
        .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
        .padding(.horizontal, AlphonsoDS.Space.s3)
        .padding(.bottom, AlphonsoDS.Space.s1)
        .accessibilityElement(children: .contain)
    }

    private func loadTranscript(episode: PodcastEpisode) async {
        guard showTranscript || showFull, let client = makePodcastClient(session: session) else { return }
        isLoadingTranscript = true
        // Both reads start together; the folder read is skipped when the episode carries its own course.
        async let fetchedTranscript = try? await client.fetchTranscript(episodeID: episode.id)
        var folders: [PodcastFolder] = []
        if episode.course == nil {
            folders = (try? await client.fetchFolders()) ?? []
        }
        let text = (await fetchedTranscript) ?? nil
        guard !Task.isCancelled else { return }
        transcriptCourse = PodcastLibrary.transcriptSaveCourse(
            episodeCourse: episode.course,
            folderID: episode.folderID,
            folders: folders,
            activeCourseCode: ActiveCoursePreference.load(for: session.userID, from: .standard).wireCode
        )
        transcript = text
        isLoadingTranscript = false
    }

    /// The thin gold line along the pill's foot: how far through the episode. Decorative; the time left is in the label.
    private func progressLine(for episode: PodcastEpisode) -> some View {
        let fraction = ListenShelf.playedFraction(elapsed: player.elapsedSeconds, durationSeconds: episode.durationSeconds)
        return GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(ds.onHero.opacity(0.2))
                Capsule().fill(ds.action).frame(width: proxy.size.width * fraction)
            }
        }
        .frame(height: AlphonsoDS.Space.s1 - 1)
        .padding(.horizontal, AlphonsoDS.Space.s4 + 2)
        .accessibilityHidden(true)
    }

    private func progressLabel(for episode: PodcastEpisode) -> String {
        if player.machine.phase == .buffering { return PodcastPlaybackCopy.bufferingLabel }
        return "Alphonso \u{00B7} " + format(max(0, Double(episode.durationSeconds) - player.elapsedSeconds)) + " left"
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
    /// The episode's course: a tapped word is saved under it.
    let course: String
    let isLoading: Bool
    /// Needed only to open a save sheet when a word is tapped.
    let session: Session

    @Environment(\.dismiss) private var dismiss
    @Environment(\.alphonsoDS) private var ds
    /// The word the learner tapped in the transcript, if a save sheet is open.
    @State private var savingWord: SaveWordRequest?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading transcript…")
                        .tint(ds.choice)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    let paragraphs = PodcastTranscript.paragraphs(transcript ?? "")
                    if paragraphs.isEmpty {
                        // Said plainly rather than rendered blank: an episode
                        // without a transcript is inaccessible to deaf
                        // learners, which is a fact about the content.
                        DSEmptyState(
                            art: "Alphonso-reading-book", title: "No transcript",
                            message: "This episode doesn't have a transcript yet.")
                            .padding()
                    } else {
                        ScrollView {
                            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                                Text("Tap any word to save it.")
                                    .dsText(.caption)
                                    .foregroundStyle(ds.inkSoft)
                                ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, paragraph in
                                    // A transcript is wholly in its episode's course language.
                                    TappableText(
                                        text: paragraph, color: ds.ink, course: course, mode: .allWords
                                    ) { savingWord = $0 }
                                    .dsText(.body)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                            .padding(AlphonsoDS.Space.s4)
                        }
                    }
                }
            }
            .background(ds.surface)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .tint(ds.choice)
                }
            }
        }
        .tint(ds.choice)
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
    /// Room under a Listen scroll view for the docked mini player: the inset alone did not reach these scroll views,
    /// so the last row sat under the bar. Only while an episode is loaded (the bar shows only then).
    func miniPlayerClearance(_ player: PodcastAudioPlayer) -> some View {
        contentMargins(.bottom, player.episode == nil ? 0 : AlphonsoDS.Space.s12 * 1.5, for: .scrollContent)
    }

    func podcastMiniBar(
        player: PodcastAudioPlayer,
        session: Session,
        downloads: PodcastDownloadManager,
        networkMonitor: NetworkMonitor
    ) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            PodcastMiniBar(player: player, session: session, downloads: downloads, networkMonitor: networkMonitor)
        }
    }
}
