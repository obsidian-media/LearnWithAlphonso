import SwiftUI
import LearnWithAlphonsoKit

/// V1's lesson browser: pick a course, see every unit and its lessons.
/// Reads entirely from the bundled ContentStore (see that type's doc
/// comment) -- no network call, works offline. Tapping a lesson opens
/// LessonPlayerView, which does hit the network on finish.
struct LessonBrowserView: View {
    let contentStore: ContentStore
    let session: Session
    let notificationScheduler: NotificationScheduler
    let networkMonitor: NetworkMonitor
    let syncQueueStore: SyncQueueStore
    /// TestFlight feedback (2026-09-29, with a screenshot): a lesson's
    /// "Begin lesson"/"Check"/"Continue" button could land exactly where
    /// the podcast mini-bar sits. `.podcastMiniBar()` on this view's own
    /// root (RootView.swift) only reserves space for THIS view's own
    /// content -- a NavigationStack's pushed destination (LessonPlayerView)
    /// replaces that content rather than being nested inside its safe-area
    /// context, so it needs the exact same reservation applied again,
    /// directly to itself. Threaded through here only to reach that one
    /// pushed screen, not used by this view's own body otherwise.
    let podcastPlayer: PodcastAudioPlayer
    let podcastDownloadManager: PodcastDownloadManager

    /// Shared with Practice and Hector, so the course picked here is the course
    /// every conversation speaks. Persisted across launches.
    @Bindable var activeCourse: ActiveCourseModel
    private var course: Course { activeCourse.course }
    @State private var showingSettings = false
    @State private var showingReview = false
    /// Which CEFR band is currently showing. Defaults to A1 until
    /// `loadLevel()` resolves the real value (or a placement test hasn't
    /// been taken yet, in which case A1 is also the right default) --
    /// mirrors web's `learn.tsx` `level` state exactly, so the two clients
    /// group lessons by level the same way and don't drift.
    @State private var selectedLevel: String = LessonBrowserView.levels[0].id
    /// TestFlight feedback (2026-09-29): "there is a circle with color
    /// beside each lesson but they need to change color as the user
    /// successfully completes that lesson." Populated by `loadLevel()`;
    /// empty (not yet loaded, or a fresh account) shows every row as
    /// not-yet-completed, same as before this fix.
    @State private var completedLessonIDs: Set<String> = []
    /// The most recently completed lesson's id, used only to scroll to
    /// "where you left off" on first appearance -- see
    /// `continueLessonID`. Also TestFlight feedback (2026-09-29): "there
    /// should be a sign that a user can know which unit was she studying
    /// ... right now endless scrolling."
    @State private var mostRecentlyCompletedLessonID: String?
    @State private var hasScrolledToContinue = false

    /// Ordered CEFR bands -- mirrors web's `src/data/levels.ts` LEVELS
    /// exactly (same ids, same order, same names) so iOS and web group
    /// lessons into identical bands rather than each deriving its own.
    static let levels: [(id: String, name: String)] = [
        ("A1", "Beginner"),
        ("A2", "Elementary"),
        ("B1", "Intermediate"),
        ("B2", "Upper Int."),
        ("C1", "Advanced"),
    ]

    /// Due reviews from the offline cache -- no network call, same posture
    /// as StatusHeaderView above. See ReviewBadge's doc comment for why a
    /// stale cache under-reports rather than over-reports.
    private var dueReviewCount: Int {
        syncQueueStore.dueReviewCount
    }

    private var reviewSubtitle: String {
        switch dueReviewCount {
        case 0: return "Nothing due right now"
        case 1: return "1 item ready to review"
        default: return "\(dueReviewCount) items ready to review"
        }
    }

    /// Only this course's units at the selected band -- the fix for the
    /// regression this whole feature closes: every unit across every
    /// level used to render in one continuous list, so reaching your
    /// actual level meant scrolling past everything below it first.
    // Fully qualified: Foundation exports its own `Unit` (Measurement's
    // base class), so a bare `Unit` here is ambiguous and the app target
    // fails to compile -- while LearnWithAlphonsoKit's own tests pass,
    // since the kit never sees Foundation's. Same convention as
    // LessonPlayerView.swift:59, which hit this first.
    private var unitsForSelectedLevel: [LearnWithAlphonsoKit.Unit] {
        contentStore.bundle(for: course).units.filter { $0.level == selectedLevel }
    }

    /// TestFlight feedback (2026-09-29): "there should be a sign that a
    /// user can know which unit was she studying ... right now endless
    /// scrolling." The lesson right after the most recently completed one,
    /// in this band's own flattened order -- the natural "continue where
    /// you left off" target. Nil (no scroll) when nothing's loaded yet,
    /// the last-completed lesson isn't in this band (it was completed at
    /// a different CEFR level than the one currently showing), or every
    /// lesson in this band is already done.
    private var continueLessonID: String? {
        let flattened = unitsForSelectedLevel.flatMap(\.lessons)
        guard let mostRecentlyCompletedLessonID,
              let idx = flattened.firstIndex(where: { $0.id == mostRecentlyCompletedLessonID }) else {
            return nil
        }
        return flattened[(idx + 1)...].first(where: { !completedLessonIDs.contains($0.id) })?.id
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { scrollProxy in
            List {
                StatusHeaderView(progress: syncQueueStore.lastKnownProgress())
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)

                // Finished lessons the server permanently rejected. Hidden when none.
                DeadLetterNoticeSection(syncQueueStore: syncQueueStore)

                // The way into the review queue. Before Phase 0 this was a
                // tab of its own and ReviewQueueView was instantiated in
                // exactly one place -- the tab bar -- so this row is what
                // keeps the queue reachable, not a convenience shortcut.
                //
                // Shown even when nothing is due, rather than hidden: a row
                // that vanishes at zero would make the queue unreachable in
                // the very change meant to keep it reachable. The tab badge
                // is the thing that hides at zero; this is the door.
                //
                // Presented rather than pushed, because ReviewQueueView owns
                // its own NavigationStack -- pushing it would nest two.
                Button {
                    showingReview = true
                } label: {
                    AlphonsoRowCard(
                        title: "Review",
                        subtitle: reviewSubtitle,
                        accent: dueReviewCount > 0 ? AlphonsoColor.ember : AlphonsoColor.hairline
                    )
                }
                .buttonStyle(.plain)
                .listRowBackground(Color.clear)

                // One card identity per course: a save or remove still in flight for the course the
                // learner just left must not land in the new course's card (its state is discarded).
                GoalCardView(session: session, course: course)
                    .id(course.translationCourseCode)

                TeamMissionSection(session: session)

                WeeklyChallengesSection(session: session)

                // Fallback for anyone RootView's post-sign-in placement
                // gate didn't reach (skipped it, or it fires for the
                // account's default course only) -- mirrors learn.tsx's
                // own persistent "Take the placement test" banner
                // exactly. See PlacementView.swift's doc comment.
                PlacementBannerSection(contentStore: contentStore, session: session, course: course)

                LevelBandPicker(selectedLevel: $selectedLevel)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 8, trailing: 0))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .onChange(of: selectedLevel) { _, newLevel in
                        saveLevel(newLevel)
                    }

                // Filtered, not the whole bundle: showing every unit at
                // every level in one list is the regression the CEFR
                // bands exist to close. The placement banner above and
                // the band picker are complementary -- placement chooses
                // your level, the picker lets you move off it.
                ForEach(unitsForSelectedLevel) { unit in
                    let lessonRows = ForEach(Array(unit.lessons.enumerated()), id: \.element.id) { index, lesson in
                        NavigationLink(value: lesson.id) {
                            AlphonsoRowCard(
                                title: lesson.title,
                                subtitle: lesson.subtitle,
                                // TestFlight feedback (2026-09-29): this
                                // dot previously never reflected real
                                // completion -- it was `index == 0`, i.e.
                                // "is this the unit's first lesson,"
                                // completely unconditionally. `.hairline`
                                // is this design system's own documented
                                // "locked/dimmed" accent (AlphonsoComponents
                                // .swift); reused here for "done" as the
                                // same "no longer the active target" idea.
                                accent: completedLessonIDs.contains(lesson.id)
                                    ? AlphonsoColor.hairline
                                    : (index == 0 ? AlphonsoColor.ember : AlphonsoColor.moss)
                            )
                        }
                        // Lazy List rows already fire onAppear as they
                        // scroll into view, so this cascades naturally
                        // rather than animating the whole (possibly
                        // 100+ row) list at once -- a small index-based
                        // delay just makes the *first* screenful cascade
                        // in visibly instead of popping in together.
                        .springEntrance(delay: Double(index % 8) * 0.04)
                        // 2026-09-29: the App Store screenshot UI test
                        // hardcoded u1l1's title ("Saying Hello," an A1
                        // lesson) to find a lesson row to open -- broke
                        // silently once the test started correctly waiting
                        // for the demo account's real saved level (B2) to
                        // load, since that lesson isn't in the visible list
                        // at all then. A stable, level-independent
                        // identifier on whichever lesson actually renders
                        // first is what the test should target instead.
                        .accessibilityIdentifier(
                            unit.id == unitsForSelectedLevel.first?.id && index == 0 ? "firstLessonRow" : ""
                        )
                    }
                    Section {
                        lessonRows
                    } header: {
                        Text("\(unit.eyebrow) · \(unit.title)")
                            .font(AlphonsoFont.sans(12, weight: .semiBold))
                            .tracking(0.4)
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                    .listRowBackground(Color.clear)
                }
            }
            .scrollContentBackground(.hidden)
            .background(AlphonsoColor.surface)
            // Re-fetches on every course switch too, since CEFR level is
            // tracked per-language server-side (language_progress), not
            // once per account -- the level that was right for English
            // isn't necessarily right for French. Keyed by `course.code`
            // (a String) rather than `course` itself -- Course declares
            // only Sendable, not Equatable, which .task(id:) requires.
            .task(id: course.code) { await loadLevel() }
            .navigationTitle("Learn with Alphonso")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    CoursePicker(course: $activeCourse.course)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape.fill")
                    }
                    .tint(AlphonsoColor.moss)
                    .accessibilityLabel("Settings")
                }
            }
            .navigationDestination(for: String.self) { lessonId in
                if let found = contentStore.findLesson(id: lessonId, course: course) {
                    LessonPlayerView(lesson: found.lesson, course: course, session: session, notificationScheduler: notificationScheduler, contentStore: contentStore, networkMonitor: networkMonitor, syncQueueStore: syncQueueStore)
                        .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
                } else {
                    Text("Lesson not found")
                }
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView(session: session)
            }
            .sheet(isPresented: $showingReview) {
                ReviewQueueView(
                    contentStore: contentStore,
                    session: session,
                    notificationScheduler: notificationScheduler,
                    networkMonitor: networkMonitor,
                    syncQueueStore: syncQueueStore
                )
            }
            // Fires once completion data has loaded and resolved a real
            // target -- guarded so switching CEFR bands by hand afterward
            // doesn't keep yanking the list back to "continue" underneath
            // the user.
            .onChange(of: continueLessonID) { _, newValue in
                guard !hasScrolledToContinue, let newValue else { return }
                hasScrolledToContinue = true
                withAnimation { scrollProxy.scrollTo(newValue, anchor: .center) }
            }
            }
        }
        .tint(AlphonsoColor.moss)
    }

    /// Mirrors web's `learn.tsx` on load: reads the server's saved CEFR
    /// level for this course and lands there directly, rather than always
    /// opening on A1 -- "a way to land on your current level instead of
    /// scrolling" is the whole point of this fetch. Best-effort: a failed
    /// fetch or no saved level yet (never placed) just keeps the A1
    /// default, same posture as this file's other best-effort network calls.
    private func loadLevel() async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        // The course this fetch is for. A slow fetch landing after the learner
        // switched course must not apply (or, via saveLevel, persist) its level
        // to the wrong course.
        let fetchedCourseCode = course.code
        let fetchedLevel = try? await client.fetchCefrLevel(course: fetchedCourseCode)
        guard !Task.isCancelled, course.code == fetchedCourseCode else { return }
        if let level = fetchedLevel, !level.isEmpty {
            selectedLevel = level
        }
        // Most-recent-first: element 0 is "the last lesson completed,"
        // which is exactly what continueLessonID needs to find where to
        // scroll to next.
        let ids = (try? await client.fetchCompletedLessonIds(course: fetchedCourseCode)) ?? []
        guard !Task.isCancelled, course.code == fetchedCourseCode else { return }
        completedLessonIDs = Set(ids)
        mostRecentlyCompletedLessonID = ids.first
    }

    /// Fire-and-forget persist, mirroring web's `pick()`: the local band
    /// switch is never blocked on the network round trip, and a failure
    /// here just means the next launch re-lands on whatever was last
    /// successfully saved rather than today's tap.
    private func saveLevel(_ level: String) {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        Task {
            try? await client.setCefrLevel(course: course.code, level: level)
        }
    }
}

private extension Course {
    var code: String {
        switch self {
        case .english: return "en"
        case .french: return "fr"
        case .spanish: return "es"
        }
    }
}

/// A horizontally-scrolling row of CEFR band capsules -- iOS's equivalent
/// of web's `SegmentedControl` in `learn.tsx`. A plain custom row instead
/// of a native `Picker` since AlphonsoComponents has no segmented-capsule
/// style to reuse today (CoursePicker above uses `.pickerStyle(.menu)`,
/// wrong shape for "show all five bands at once").
private struct LevelBandPicker: View {
    @Binding var selectedLevel: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: AlphonsoSpacing.sm) {
                ForEach(LessonBrowserView.levels, id: \.id) { level in
                    Button {
                        selectedLevel = level.id
                    } label: {
                        VStack(spacing: 1) {
                            Text(level.id)
                                .font(AlphonsoFont.sans(13, weight: .semiBold))
                            Text(level.name)
                                .font(AlphonsoFont.sans(9))
                        }
                        .padding(.horizontal, AlphonsoSpacing.sm + 2)
                        .padding(.vertical, AlphonsoSpacing.sm - 2)
                        .foregroundStyle(level.id == selectedLevel ? AlphonsoColor.onPrimary : AlphonsoColor.ink)
                        .background(
                            Capsule().fill(level.id == selectedLevel ? AlphonsoColor.moss : AlphonsoColor.parchment)
                        )
                        .overlay(
                            Capsule().strokeBorder(AlphonsoColor.hairline, lineWidth: level.id == selectedLevel ? 0 : 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 1)
        }
    }
}

/// Self-contained (fetches its own data), same shape as web's
/// WeeklyChallengesCard -- renders nothing while loading or once
/// resolved with no challenges, so it never disrupts LessonBrowserView's
/// otherwise-offline content list.
private struct WeeklyChallengesSection: View {
    let session: Session

    @State private var challenges: [WeeklyChallenge] = []
    @State private var isLoading = true

    var body: some View {
        Group {
            if !isLoading && !challenges.isEmpty {
                Section {
                    ForEach(challenges) { c in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(c.title)
                                .font(AlphonsoFont.sans(15, weight: .medium))
                                .strikethrough(c.completed)
                                .foregroundStyle(c.completed ? AlphonsoColor.inkSoft : AlphonsoColor.ink)
                            AlphonsoProgressBar(progress: Double(min(c.progress, c.threshold)) / Double(max(c.threshold, 1)))
                            Text("\(min(c.progress, c.threshold))/\(c.threshold)")
                                .font(AlphonsoFont.sans(11))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                        }
                        .padding(.vertical, 2)
                    }
                } header: {
                    Text("This week's challenges")
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
                }
                .listRowBackground(AlphonsoColor.parchment)
            }
        }
        // Group keeps a stable identity across the isLoading transition,
        // so this fires exactly once when the section first appears --
        // not once per branch, unlike attaching .task separately inside
        // each conditional branch.
        .task { await load() }
    }

    private func load() async {
        guard let accessToken = session.accessToken else { isLoading = false; return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        challenges = (try? await client.getWeeklyChallenges()) ?? []
        isLoading = false
    }
}

/// Mirrors learn.tsx's own persistent "Take the placement test" banner:
/// hidden until the check resolves (same `!hydrated` guard reasoning as
/// WeeklyChallengesSection above), then shown only when this course's
/// placement genuinely hasn't been taken. Re-checks whenever `course`
/// changes -- placement is per-course, and this view's own CoursePicker
/// can switch it at any time.
private struct PlacementBannerSection: View {
    let contentStore: ContentStore
    let session: Session
    let course: Course

    @State private var isChecking = true
    @State private var isTaken = false
    @State private var showingPlacementTest = false

    var body: some View {
        Group {
            if !isChecking && !isTaken {
                Section {
                    Button {
                        showingPlacementTest = true
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Not sure where to start?")
                                .font(AlphonsoFont.sans(15, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.ink)
                            Text("Take a quick placement test and we'll set your CEFR level for you.")
                                .font(AlphonsoFont.sans(12))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                            Text("Take the placement test")
                                .font(AlphonsoFont.sans(12, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.moss)
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
                .listRowBackground(AlphonsoColor.ember.opacity(0.1))
            }
        }
        // Same stable-identity-across-loading reasoning as
        // WeeklyChallengesSection's own .task -- fires once per
        // appearance, and again whenever `course` changes.
        .task(id: course) { await check() }
        .fullScreenCover(isPresented: $showingPlacementTest) {
            PlacementView(contentStore: contentStore, session: session, course: course) {
                showingPlacementTest = false
                isTaken = true
            }
        }
    }

    private func check() async {
        isChecking = true
        guard let accessToken = session.accessToken else { isChecking = false; return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            isTaken = try await client.fetchPlacementTakenAt(course: course.code) != nil
        } catch {
            // Best-effort: leave the banner hidden for this check rather
            // than showing it on a network hiccup -- same posture as
            // WeeklyChallengesSection.load().
            isTaken = true
        }
        isChecking = false
    }
}
