import SwiftUI
import LearnWithAlphonsoKit

/// V1's lesson browser: pick a course, see every unit and its lessons.
/// Reads entirely from the bundled ContentStore (see that type's doc
/// comment) -- no network call, works offline. Tapping a lesson opens
/// LessonPlayerView, which does hit the network on finish.
struct LessonBrowserView: View {
    @Environment(\.alphonsoDS) private var ds
    let contentStore: ContentStore
    let session: Session
    let notificationScheduler: NotificationScheduler
    let networkMonitor: NetworkMonitor
    let syncQueueStore: SyncQueueStore
    /// False until RootView has finished deciding whether to show the name prompt and placement. The placement
    /// banner stays hidden until then: tapping it earlier would put up a cover that stops RootView's own
    /// onboarding cover from presenting.
    let onboardingSettled: Bool
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
    /// For the lesson-complete screen's "Practice with Hector" button.
    var hectorAccess: HectorAccess? = nil
    private var course: Course { activeCourse.course }
    @State private var showingSettings = false
    @State private var showingReview = false
    // The cards below the goal card are loaded HERE, from tasks on the always-present List. A section that is
    // empty until its data arrives produces no List row, so a .task attached to it never fires.
    @StateObject private var missionModel = TeamMissionModel()
    @State private var challenges: [WeeklyChallenge] = []
    @State private var isCheckingPlacement = true
    @State private var placementTaken = false
    /// What the placement state above was last checked for (course and onboarding state), so re-appearing
    /// does not flash the banner. Finishing onboarding changes it, which re-checks placement.
    @State private var placementCheckedKey: String?
    @State private var showingPlacementTest = false
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
    /// Round 6.1: which folded rows the learner opened, and whether the current unit is on screen (for Jump to current).
    @State private var expandedFolds: Set<String> = []
    @State private var showAllUnits = false
    @State private var currentUnitVisible = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// Set by tapping the current node on the path map; pushes the same lesson screen a list row does.
    /// A wrapper type, not a bare String: a String destination is already registered for the NavigationLinks.
    @State private var openedLesson: OpenedLesson?
    /// "Build my path" (the learning path's goal, level, date and type switches).
    @State private var showingPathBuild = false

    private struct OpenedLesson: Hashable { let id: String }

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

    /// The first lesson in this band not yet completed, and its unit (web: learn.tsx's firstUndone).
    private var nextLesson: (unit: LearnWithAlphonsoKit.Unit, lesson: Lesson)? {
        for unit in unitsForSelectedLevel {
            if let lesson = unit.lessons.first(where: { !completedLessonIDs.contains($0.id) }) {
                return (unit, lesson)
            }
        }
        return nil
    }

    // MARK: Round 6.1 fold

    private var foldRows: [FoldRow] {
        LearnFold.limitAhead(allFoldRows, showAll: showAllUnits).rows
    }

    private var hiddenFoldRooms: Int { LearnFold.limitAhead(allFoldRows, showAll: showAllUnits).hidden }

    private var allFoldRows: [FoldRow] {
        LearnFold.foldLearn(
            unitsForSelectedLevel.map { FoldUnit(id: $0.id, eyebrow: $0.eyebrow, title: $0.title, lessonIDs: $0.lessons.map(\.id)) },
            completed: completedLessonIDs
        )
    }

    private var currentUnit: LearnFold.CurrentUnit? {
        LearnFold.currentUnitOf(
            unitsForSelectedLevel.map { FoldUnit(id: $0.id, eyebrow: $0.eyebrow, title: $0.title, lessonIDs: $0.lessons.map(\.id)) },
            completed: completedLessonIDs
        )
    }

    /// The painted room behind a unit: the bundled unit -> room map first, then the fixed rotation by place in the band.
    private func roomID(for unit: LearnWithAlphonsoKit.Unit) -> String {
        if let mapped = LessonData.roomMap?.roomID(forUnit: unit.id) { return mapped }
        let index0 = unitsForSelectedLevel.firstIndex(where: { $0.id == unit.id }) ?? 0
        return LearnFold.roomArtFor(index0)
    }

    private func toggleFold(_ key: String) {
        withAnimation(learnFoldAnimation(reduceMotion: reduceMotion)) {
            if expandedFolds.contains(key) { expandedFolds.remove(key) } else { expandedFolds.insert(key) }
        }
    }

    /// A unit's banner and its lesson tiles, as plain List rows.
    @ViewBuilder
    private func unitContent(_ unit: LearnWithAlphonsoKit.Unit, isCurrent: Bool) -> some View {
        unitBanner(unit)
            .modifier(CurrentUnitMarker(active: isCurrent, onVisibility: { currentUnitVisible = $0 }))
        ForEach(Array(unit.lessons.enumerated()), id: \.element.id) { index, lesson in
            // A chunky tile with a status medallion: done (completed), next (the band's next lesson), or
            // its number. The link sits invisibly behind it, so List adds no disclosure chevron.
            LessonPathRow(
                number: index + 1,
                title: lesson.title,
                subtitle: lesson.subtitle,
                status: completedLessonIDs.contains(lesson.id)
                    ? .done
                    : (nextLesson?.lesson.id == lesson.id ? .next : .open)
            )
            .background(NavigationLink(value: lesson.id) { EmptyView() }.opacity(0))
            .accessibilityAddTraits(.isButton)
            // Lazy List rows fire onAppear as they scroll into view, so the first screenful cascades in.
            .springEntrance(delay: Double(index % 8) * 0.04)
            // A stable, level-independent identifier on whichever lesson renders first, for the screenshot UI test.
            .accessibilityIdentifier(
                unit.id == unitsForSelectedLevel.first?.id && index == 0 ? "firstLessonRow" : ""
            )
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
        }
    }

    /// A glass banner over the scene: the unit's number small, its title large, and how many lessons are done.
    private func unitBanner(_ unit: LearnWithAlphonsoKit.Unit) -> some View {
        // At accessibility sizes the count drops under the title, so neither word is cut mid-letter.
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: AlphonsoSpacing.xs))
            : AnyLayout(HStackLayout(alignment: .center, spacing: AlphonsoSpacing.sm))
        return layout {
            VStack(alignment: .leading, spacing: 2) {
                Text(unit.eyebrow.uppercased())
                    .dsText(.caption)
                    .foregroundStyle(ds.flame)
                Text(unit.title)
                    .dsText(.headline)
                    .foregroundStyle(ds.ink)
            }
            Spacer(minLength: 0)
            Text("\(unit.lessons.filter { completedLessonIDs.contains($0.id) }.count)/\(unit.lessons.count) done")
                .dsText(.caption)
                .monospacedDigit()
                .foregroundStyle(ds.inkSoft)
        }
        .padding(.horizontal, AlphonsoSpacing.md)
        .padding(.vertical, AlphonsoSpacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .alphonsoGlass(radius: AlphonsoRadius.xl)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }


    var body: some View {
        NavigationStack {
            ScrollViewReader { scrollProxy in
            List {
                StatusHeaderView(progress: syncQueueStore.lastKnownProgress())
                    .sceneScrollProbe()
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)

                if let progress = syncQueueStore.lastKnownProgress() {
                    // Only the freeze count goes back into the shared cache: its XP is whichever course updated last.
                    StreakFreezeRow(
                        cachedFreezes: progress.streakFreezes, course: course, session: session,
                        isOnline: networkMonitor.isConnected,
                        onFreezesChanged: { freezes in
                            // Read the cache again now: the render-time copy may be older than a sync that landed since.
                            guard let latest = syncQueueStore.lastKnownProgress() else { return }
                            syncQueueStore.updateLastKnownProgress(StreakFreezeShop.cachedProgress(freezes: freezes, from: latest))
                        }
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }

                // One loud card for the next lesson in this band, with the unit's lessons as a short path.
                if let next = nextLesson {
                    // The unit as a winding path over the garden, Alphonso beside the current node.
                    LearnPathMap(
                        nodes: UnitPath.nodes(lessonIDs: next.unit.lessons.map(\.id), completed: completedLessonIDs).map { node in
                            PathMapNode(id: node.id, title: next.unit.lessons.first { $0.id == node.id }?.title ?? "", state: node.state)
                        },
                        greeting: StatusHeaderView.greeting(streak: syncQueueStore.lastKnownProgress()?.streak ?? 0),
                        onOpen: { openedLesson = OpenedLesson(id: $0) }
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)

                    // The link sits invisibly behind the card: a visible NavigationLink in a List adds a
                    // disclosure chevron beside the card and narrows it.
                    LearnCurrentUnitCard(
                        unitNumber: currentUnit?.index ?? 1,
                        unitCount: currentUnit?.count ?? 1,
                        unitTitle: next.unit.title,
                        lessonTitle: next.lesson.title,
                        roomID: roomID(for: next.unit)
                    )
                    .accessibilityAddTraits(.isButton)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }

                // Finished lessons the server permanently rejected. Hidden when none.
                DeadLetterNoticeSection(syncQueueStore: syncQueueStore)

                // Finished work still waiting to reach the server. Hidden when the queue is empty.
                PendingSyncSection(syncQueueStore: syncQueueStore, session: session, isConnected: networkMonitor.isConnected)

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
                        accent: dueReviewCount > 0 ? ds.flame : ds.line
                    )
                }
                .buttonStyle(.plain)
                .listRowBackground(Color.clear)

                // One card identity per course: a save or remove still in flight for the course the
                // learner just left must not land in the new course's card (its state is discarded).
                PathCardSection(session: session, course: course) { showingPathBuild = true }
                    .id(course.translationCourseCode)

                TeamMissionSection(mission: missionModel.mission)

                WeeklyChallengesSection(challenges: challenges)

                // Fallback for anyone RootView's post-sign-in placement
                // gate didn't reach (skipped it, or it fires for the
                // account's default course only) -- mirrors learn.tsx's
                // own persistent "Take the placement test" banner
                // exactly. See PlacementView.swift's doc comment.
                PlacementBannerSection(isVisible: onboardingSettled && !isCheckingPlacement && !placementTaken) { showingPlacementTest = true }

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
                // Round 6.1 (option A): finished units fold into one row per run, the current unit stays open,
                // and units ahead fold to their name. The rules are LearnFold in the Kit. Filtered by the selected
                // band as before: the placement banner chooses your level, the picker lets you move off it.
                ForEach(foldRows, id: \.key) { row in
                    switch row {
                    case .doneRun(let key, let unitIDs, let first, let last, let done, let total):
                        Section {
                            LearnFoldRow(
                                title: LearnFold.runLabel(first: first, last: last),
                                detail: "\(done) / \(total)",
                                isExpanded: expandedFolds.contains(key),
                                spokenDetail: "\(done) of \(total) lessons done"
                            ) { toggleFold(key) }
                            .foldRowStyle()
                            if expandedFolds.contains(key) {
                                ForEach(unitsForSelectedLevel.filter { unitIDs.contains($0.id) }) { unit in
                                    unitContent(unit, isCurrent: false)
                                }
                            }
                        }
                    case .unit(let key, let unitID, let state, _, _):
                        if let unit = unitsForSelectedLevel.first(where: { $0.id == unitID }) {
                            Section {
                                if state == .current {
                                    unitContent(unit, isCurrent: true)
                                } else {
                                    LearnFoldRow(
                                        title: "\(unit.eyebrow) · \(unit.title)",
                                        detail: "",
                                        isExpanded: expandedFolds.contains(key),
                                        spokenDetail: ""
                                    ) { toggleFold(key) }
                                    .foldRowStyle()
                                    if expandedFolds.contains(key) {
                                        unitContent(unit, isCurrent: false)
                                    }
                                }
                            }
                        }
                    }
                }
                if hiddenFoldRooms > 0 {
                    Button("Show all units in \(selectedLevel) (\(hiddenFoldRooms) more)") { showAllUnits = true }
                        .dsText(.footnote)
                        .foregroundStyle(ds.ink)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .listRowBackground(Color.clear)
                }
            }
            .scrollContentBackground(.hidden)
            .background(ds.surface)
            .overlay(alignment: .bottom) {
                if !currentUnitVisible, currentUnit != nil {
                    JumpToCurrentButton {
                        withAnimation(learnFoldAnimation(reduceMotion: reduceMotion)) {
                            scrollProxy.scrollTo(LearnFoldAnchor.current, anchor: .top)
                        }
                    }
                    .padding(.bottom, AlphonsoSpacing.md)
                }
            }
            .screenScene(
                .learn,
                clip: .learn,
                // Alphonso waves at 67% across with his head top 54% down in the clip: the greeting bubble is pinned just
                // above it (its tail points down at him). Only when the map is on screen, since the map is what speaks it.
                pin: nextLesson == nil ? nil : ClipPin(x: 64, y: 53) {
                    PathSpeechBubble(message: StatusHeaderView.greeting(streak: syncQueueStore.lastKnownProgress()?.streak ?? 0))
                        .frame(width: 210)
                }
            )
            // Re-fetches on every course switch too, since CEFR level is
            // tracked per-language server-side (language_progress), not
            // once per account -- the level that was right for English
            // isn't necessarily right for French. Keyed by `course.code`
            // (a String) rather than `course` itself -- Course declares
            // only Sendable, not Equatable, which .task(id:) requires.
            // Also re-run when onboarding settles and when a placement test is finished: both can change the
            // saved level while this screen is already on screen, and it used to keep showing A1 until relaunch.
            .task(id: "\(course.code)-\(onboardingSettled)-\(placementTaken)") { await loadLevel() }
            .task { await missionModel.load(session: session) }
            .task { await loadChallenges() }
            .task(id: "\(course.code)-\(onboardingSettled)") { await checkPlacement() }
            .fullScreenCover(isPresented: $showingPlacementTest) {
                PlacementView(contentStore: contentStore, session: session, course: course) {
                    showingPlacementTest = false
                    placementTaken = true
                }
            }
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
                    .tint(ds.choice)
                    .accessibilityLabel("Settings")
                }
            }
            .navigationDestination(for: String.self) { lessonId in
                lessonDestination(lessonId)
            }
            .navigationDestination(item: $openedLesson) { opened in
                lessonDestination(opened.id)
            }
            .navigationDestination(for: PathRoute.self) { route in
                PathScreen(route: route, session: session, course: course) { lessonID in
                    openedLesson = OpenedLesson(id: lessonID)
                }
            }
            .sheet(isPresented: $showingPathBuild) {
                PathBuildView(session: session, course: course)
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
        .tint(ds.choice)
    }

    /// The lesson screen, shared by the list rows, the Up next card and the path map's current node.
    @ViewBuilder
    private func lessonDestination(_ lessonId: String) -> some View {
        if let found = contentStore.findLesson(id: lessonId, course: course) {
            LessonPlayerView(lesson: found.lesson, course: course, session: session, notificationScheduler: notificationScheduler, contentStore: contentStore, networkMonitor: networkMonitor, syncQueueStore: syncQueueStore, hectorAccess: hectorAccess)
                .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
        } else {
            Text("Lesson not found")
        }
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

    /// Best-effort, shows nothing on failure. A cancelled load leaves the section as it was.
    private func loadChallenges() async {
        guard let accessToken = await session.freshAccessToken() else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        let result = (try? await client.getWeeklyChallenges()) ?? []
        guard !Task.isCancelled else { return }
        challenges = result
    }

    /// Placement is per-course, so this re-runs when the course changes. A failed check leaves the banner
    /// hidden rather than showing it on a network hiccup.
    private func checkPlacement() async {
        let key = "\(course.code)-\(onboardingSettled)"
        if placementCheckedKey != key { isCheckingPlacement = true }
        guard let accessToken = await session.freshAccessToken() else {
            // No token: fail hidden, like a failed check.
            placementTaken = true
            isCheckingPlacement = false
            return
        }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        let fetchedCourseCode = course.code
        let taken: Bool
        do {
            taken = try await client.fetchPlacementTakenAt(course: fetchedCourseCode) != nil
        } catch {
            taken = true
        }
        guard !Task.isCancelled, course.code == fetchedCourseCode else { return }
        placementTaken = taken
        placementCheckedKey = key
        isCheckingPlacement = false
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
    @Environment(\.alphonsoDS) private var ds
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
                                .dsText(.footnote)
                            Text(level.name)
                                .dsText(.caption)
                        }
                        .padding(.horizontal, AlphonsoSpacing.sm + 2)
                        .padding(.vertical, AlphonsoSpacing.sm - 2)
                        .foregroundStyle(level.id == selectedLevel ? ds.onAction : ds.ink)
                        .background(
                            Capsule().fill(level.id == selectedLevel ? ds.action : ds.sunk)
                        )
                        .overlay(
                            Capsule().strokeBorder(ds.line, lineWidth: level.id == selectedLevel ? 0 : 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 1)
        }
    }
}

/// Same shape as web's WeeklyChallengesCard -- renders nothing until the host has loaded challenges (the host
/// owns the load; see the note on LessonBrowserView's state), so it never disrupts the otherwise-offline list.
private struct WeeklyChallengesSection: View {
    @Environment(\.alphonsoDS) private var ds
    let challenges: [WeeklyChallenge]

    var body: some View {
        if !challenges.isEmpty {
            Section {
                ForEach(challenges) { c in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(c.title)
                            .dsText(.footnote)
                            .strikethrough(c.completed)
                            .foregroundStyle(c.completed ? ds.inkSoft : ds.ink)
                        AlphonsoProgressBar(progress: Double(min(c.progress, c.threshold)) / Double(max(c.threshold, 1)))
                        Text("\(min(c.progress, c.threshold))/\(c.threshold)")
                            .dsText(.caption)
                            .foregroundStyle(ds.inkSoft)
                    }
                    .padding(.vertical, 2)
                }
            } header: {
                Text("This week's challenges")
                    .dsText(.caption)
                    .foregroundStyle(ds.flame)
            }
            .listRowBackground(ds.choiceTint)
        }
    }
}

/// Mirrors learn.tsx's own persistent "Take the placement test" banner: shown only when the host has resolved
/// that this course's placement genuinely hasn't been taken.
private struct PlacementBannerSection: View {
    @Environment(\.alphonsoDS) private var ds
    let isVisible: Bool
    let onTap: () -> Void

    var body: some View {
        if isVisible {
            Section {
                Button(action: onTap) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Not sure where to start?")
                            .dsText(.footnote)
                            .foregroundStyle(ds.ink)
                        Text("Take a quick placement test and we'll set your CEFR level for you.")
                            .dsText(.caption)
                            .foregroundStyle(ds.inkSoft)
                        Text("Take the placement test")
                            .dsText(.caption)
                            .foregroundStyle(ds.action)
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
            }
            .listRowBackground(ds.action.opacity(0.1))
        }
    }
}
