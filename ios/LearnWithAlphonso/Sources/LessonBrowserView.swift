import SwiftUI
import LearnWithAlphonsoKit

/// V1's lesson browser: pick a course, see every unit and its lessons.
/// Reads entirely from the bundled ContentStore (see that type's doc
/// comment) -- no network call, works offline. Tapping a lesson opens
/// LessonPlayerView, which does hit the network on finish.
struct LessonBrowserView: View {
    @Environment(\.alphonsoDS) private var ds
    /// A lesson another tab asked for (a video's "practice this"); the path screen opens its own lessons directly.
    @Environment(PathDeepLink.self) private var deepLink
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
    /// This week's weekly_quests (claimable XP rewards); not the challenges above, which pay themselves.
    @State private var quests: [WeeklyQuest] = []
    /// The last read of the weekly challenges or quests failed: the card says so with Try again and keeps what it had.
    @State private var challengesReadFailed = false
    @State private var questsReadFailed = false
    private var weeklyReadFailed: Bool { challengesReadFailed || questsReadFailed }
    @State private var questNotice: String?
    /// The course `quests` belongs to, so a refresh of the same course keeps its list and a switch clears it.
    @State private var questsCourse: String?
    @State private var claimingQuestID: String?
    @State private var isCheckingPlacement = true
    @State private var placementTaken = false
    /// The first-run level and whether the learner said "Not now" for this course: they decide how the placement offer
    /// looks (PlacementOffer in the Kit). Learn shows it first, above the map.
    @State private var firstRunLevel: String?
    @State private var offerDismissed = false
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
    /// The level the server holds for each course (by course code), as last read or saved; missing until known.
    /// start-lesson-session opens lessons from it, so the picker never stays on a level that did not save (`saveLevel`).
    @State private var savedLevels: [String: String] = [:]
    @State private var levelSaveTask: Task<Void, Never>?
    /// The course of the pick still saving, if any, and a count of picks so only the newest one acts on its result.
    @State private var levelSavingCourse: String?
    @State private var levelPickNumber = 0
    /// Set when a pick could not be saved and the picker went back; cleared by the next pick.
    @State private var levelSaveMessage: String?
    /// A level the app set itself (read from the server, or a failed pick put back): its change is not a pick to save.
    /// A value, not a flag: if that change never reaches onChange, the next real pick (another level) still saves.
    @State private var levelSetByApp: String?
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
    /// "For you" rail: which card's detail is open below the rail (the path, the team mission or the challenges).
    @State private var forYouDetail: ForYouDetail?
    /// The streak-freeze shop row, shown from the streak pill on the slim status row.
    @State private var showingFreezeShop = false
    /// The path as the rail's card reads it (its own copy; the detail below loads another, like the road screen).
    @State private var railPath: PathModel?
    /// Bumped when the goal planner closes, so the opened path detail reads the new goal too.
    @State private var pathReloadToken = 0

    private enum ForYouDetail: Hashable { case path, team, weekly }

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

    private var levelLessonCount: Int { unitsForSelectedLevel.reduce(0) { $0 + $1.lessons.count } }
    private var levelDoneCount: Int {
        unitsForSelectedLevel.reduce(0) { $0 + $1.lessons.filter { completedLessonIDs.contains($0.id) }.count }
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

    /// The learner's place in the whole course: the first lesson not done, across every level, in LEARNING order (band
    /// by band, as the web's foldUnits): the curriculum interleaves bands, and the server opens lessons only in this
    /// order. The map is one band's climb, so its sheet says "Continue lesson" only when its next lesson is this one
    /// (web: continueLessonId).
    private var courseContinueLessonID: String? {
        for unit in LearnFold.inLearningOrder(contentStore.bundle(for: course).units, level: \.level) {
            if let lesson = unit.lessons.first(where: { !completedLessonIDs.contains($0.id) }) { return lesson.id }
        }
        return nil
    }

    /// The climbing map's data, built by the shared model (`LearnMap.climb`) from this band's units in curriculum order.
    /// nil (no map) while the timing table is missing. Only the first lesson not done is counted for words: it is the
    /// lesson the sheet is about, and counting every lesson of the band on each render would be wasted work.
    private var climbMap: LearnMap.Climb? {
        guard let timing = LessonData.timing else { return nil }
        let nextID = nextLesson?.lesson.id
        let units: [LearnMap.Unit] = unitsForSelectedLevel.map { unit in
            LearnMap.Unit(
                id: unit.id,
                title: unit.title,
                lessons: unit.lessons.map { lesson in
                    LearnMap.Lesson(
                        id: lesson.id,
                        title: lesson.title,
                        subtitle: lesson.subtitle,
                        questionTypes: lesson.questions.map(\.typeKey),
                        wordCount: lesson.id == nextID ? deriveVocab(lesson: lesson, images: contentStore.vocabImages).count : 0
                    )
                }
            )
        }
        return LearnMap.climb(units: units, completed: completedLessonIDs, timing: timing)
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
        let index0 = contentStore.bundle(for: course).units.firstIndex(where: { $0.id == unit.id }) ?? 0
        return LearnFold.roomArtFor(index0)
    }

    /// A unit's place among the units of its own level, the same count the web hero and Android show ("Unit 1 of 28").
    private func coursePlace(of unit: LearnWithAlphonsoKit.Unit) -> (index: Int, count: Int) {
        let all = contentStore.bundle(for: course).units.filter { $0.level == unit.level }
        return ((all.firstIndex { $0.id == unit.id } ?? 0) + 1, max(all.count, 1))
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

    /// "My path" / "Build my path": the value the rail card shows for the learner's goal.
    private var railPathValue: String {
        switch railPath?.phase ?? .loading {
        case .loading: return "Loading"
        case .failed: return "Couldn't load"
        case .none: return "Set a goal"
        case .ready(let path):
            return path.goalIsSuggested ? "Suggested for you" : PathGoalCard.lines(for: path).headline
        }
    }

    private func toggleForYou(_ detail: ForYouDetail) {
        withAnimation(learnFoldAnimation(reduceMotion: reduceMotion)) {
            forYouDetail = forYouDetail == detail ? nil : detail
        }
    }

    /// The rail's cards. Team mission and weekly challenges appear only when there is something to show, as their
    /// sections always did; Review and the path are always there (Review is the door to the queue, even at zero).
    private var forYouItems: [LearnForYouRail.Item] {
        let hasNoGoal = railPath?.hasNoPath == true
        var items: [LearnForYouRail.Item] = [
            LearnForYouRail.Item(
                id: "review", emoji: "\u{1F4DA}", title: "Review",
                value: dueReviewCount > 0 ? "\(dueReviewCount) due" : "All caught up",
                spoken: "Review, \(reviewSubtitle)",
                showsDot: dueReviewCount > 0,
                action: { showingReview = true }),
            LearnForYouRail.Item(
                id: "path", emoji: "\u{1F9ED}",
                title: hasNoGoal ? "Build my path" : "My path",
                value: railPathValue,
                spoken: "\(hasNoGoal ? "Build my path" : "My path"), \(railPathValue)",
                expanded: hasNoGoal ? nil : (forYouDetail == .path),
                action: {
                    // No goal yet: straight to the planner (what the goal card did). With a goal: open its detail.
                    // Still loading: nothing to open yet. Failed: try again.
                    switch railPath?.phase ?? .loading {
                    case .none: showingPathBuild = true
                    case .ready: toggleForYou(.path)
                    case .failed: Task { await railPath?.load() }
                    case .loading: break
                    }
                }),
        ]
        if let mission = missionModel.mission {
            let value = mission.status == .needsMembers ? "Invite a friend" : "\(mission.percent)% done"
            items.append(LearnForYouRail.Item(
                id: "team", emoji: "\u{1F3AF}", title: "Team mission", value: value,
                spoken: "Team mission, \(value)",
                expanded: forYouDetail == .team,
                action: { toggleForYou(.team) }))
        }
        if !challenges.isEmpty || !quests.isEmpty || weeklyReadFailed {
            let value = WeeklyQuests.railValue(
                challengesDone: challenges.filter(\.completed).count, challengesTotal: challenges.count,
                questCount: quests.count, failed: weeklyReadFailed)
            // A finished quest that is not yet claimed is a reward waiting to be claimed (challenges pay themselves).
            let claimReady = quests.contains(where: \.claimable)
            items.append(LearnForYouRail.Item(
                id: "weekly", emoji: "\u{2B50}", title: "Weekly", value: value,
                spoken: "Weekly challenges, \(value)\(claimReady ? ", reward ready to claim" : "")",
                showsDot: claimReady,
                expanded: forYouDetail == .weekly,
                action: { toggleForYou(.weekly) }))
        }
        return items
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { scrollProxy in
            List {
                StatusHeaderView(progress: syncQueueStore.lastKnownProgress(),
                    onStreakTap: {
                        withAnimation(learnFoldAnimation(reduceMotion: reduceMotion)) { showingFreezeShop.toggle() }
                    },
                    freezeShopOpen: showingFreezeShop)
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)

                if showingFreezeShop, let progress = syncQueueStore.lastKnownProgress() {
                    // Only the freeze count goes back into the shared cache: its XP is whichever course updated last.
                    StreakFreezeRow(
                        cachedFreezes: progress.streakFreezes, course: course, session: session,
                        isOnline: networkMonitor.isConnected,
                        onFreezesChanged: { freezes in
                            // Read the cache again now: the render-time copy may be older than a sync that landed since.
                            guard let latest = syncQueueStore.lastKnownProgress() else { return }
                            syncQueueStore.updateLastKnownProgress(StreakFreezeShop.cachedProgress(freezes: freezes, from: latest), synced: false)
                        }
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }

                // The placement offer, first on the page (not under the map): a prominent card for learners who know
                // "some" or are "confident", the small card for everyone else (and after "Not now"). Nothing once placed.
                PlacementBannerSection(
                    style: onboardingSettled && !isCheckingPlacement
                        ? PlacementOffer.style(level: firstRunLevel, placementTaken: placementTaken, dismissed: offerDismissed, surface: .learn)
                        : .none,
                    onStart: { showingPlacementTest = true },
                    onNotNow: {
                        PlacementOfferLoader.dismiss(courseCode: course.code)
                        offerDismissed = true
                    })

                // The one map: the climbing map for the learner's unit in the band on screen (Path B). It replaces the
                // old hero, never sits beside it. Its nodes and the start sheet open lessons through `openedLesson`.
                if let climb = climbMap {
                    LearnClimbMap(
                        climb: climb,
                        greeting: StatusHeaderView.greeting(streak: StatusHeaderView.shownStreak(syncQueueStore.lastKnownProgress())),
                        continueLessonID: courseContinueLessonID,
                        onOpenLesson: { openedLesson = OpenedLesson(id: $0) }
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }

                // Finished lessons the server permanently rejected. Hidden when none.
                DeadLetterNoticeSection(syncQueueStore: syncQueueStore)

                // Finished work still waiting to reach the server. Hidden when the queue is empty.
                PendingSyncSection(syncQueueStore: syncQueueStore, session: session, isConnected: networkMonitor.isConnected)

                // The way into the review queue lives in the For you rail (its first card). Before Phase 0 this was a
                // tab of its own and ReviewQueueView was instantiated in exactly one place -- the tab bar -- so the
                // card is what keeps the queue reachable, not a convenience shortcut.
                //
                // Shown even when nothing is due, rather than hidden: a card that vanished at zero would make the
                // queue unreachable. The tab badge is the thing that hides at zero; this is the door.
                //
                // Presented rather than pushed (showingReview), because ReviewQueueView owns its own
                // NavigationStack -- pushing it would nest two.
                if let railPath {
                    LearnPathCards(
                        model: railPath, session: session, course: course,
                        onBuild: { showingPathBuild = true },
                        onOpenLesson: { openedLesson = OpenedLesson(id: $0) },
                        onOpenReview: { showingReview = true }
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }

                LearnForYouRail(items: forYouItems)
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)

                // The opened card's full detail, in place under the rail. One card identity per course: a save or
                // remove still in flight for the course the learner just left must not land in the new course's card.
                if forYouDetail == .path {
                    PathCardSection(session: session, course: course) { showingPathBuild = true }
                        .id("\(course.translationCourseCode)-\(pathReloadToken)")
                }
                if forYouDetail == .team {
                    TeamMissionSection(mission: missionModel.mission, plainInsets: true)
                }
                if forYouDetail == .weekly {
                    if weeklyReadFailed {
                        WeeklyLoadFailedSection {
                            Task {
                                await loadChallenges()
                                await loadQuests()
                            }
                        }
                    }
                    WeeklyChallengesSection(challenges: challenges)
                    WeeklyQuestsSection(quests: quests, notice: questNotice, claimingID: claimingQuestID) { quest in
                        Task { await claimQuest(quest) }
                    }
                }

                // Fallback for anyone RootView's post-sign-in placement
                // gate didn't reach (skipped it, or it fires for the
                // account's default course only) -- mirrors learn.tsx's
                // own persistent "Take the placement test" banner
                // exactly. See PlacementView.swift's doc comment.
                LearnUnitsHeader(selectedLevel: $selectedLevel, done: levelDoneCount, total: levelLessonCount)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 8, trailing: 0))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .onChange(of: selectedLevel) { oldLevel, newLevel in
                        let ours = levelSetByApp
                        levelSetByApp = nil
                        if newLevel == ours { return }
                        saveLevel(newLevel, previous: oldLevel)
                    }

                if let levelSaveMessage {
                    Text(levelSaveMessage)
                        .dsText(.footnote)
                        .foregroundStyle(ds.wrongInk)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
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
            // An inset, not an overlay: the list ends above the button, so it never covers a row.
            .safeAreaInset(edge: .bottom) {
                if !currentUnitVisible, currentUnit != nil {
                    JumpToCurrentButton {
                        withAnimation(learnFoldAnimation(reduceMotion: reduceMotion)) {
                            scrollProxy.scrollTo(LearnFoldAnchor.current, anchor: .top)
                        }
                    }
                    .padding(.vertical, AlphonsoSpacing.sm)
                }
            }
            // Learn sits on the flat cream surface (the hero card brings its own room); no full-screen clip.
            .background(ds.surface)
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
            .task(id: course.code) { await loadQuests() }
            .task(id: course.translationCourseCode) {
                let made = PathModel(session: session, courseCode: course.translationCourseCode)
                railPath = made
                await made.load()
            }
            .task(id: "\(course.code)-\(onboardingSettled)") { await checkPlacement() }
            .task(id: course.code) {
                offerDismissed = PlacementOfferLoader.isDismissed(courseCode: course.code)
                firstRunLevel = await PlacementOfferLoader.firstRunLevel(session: session)
            }
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
            .task(id: deepLink.pending) {
                if case .review? = deepLink.pending {
                    deepLink.pending = nil
                    showingReview = true
                    return
                }
                guard case let .lesson(id)? = deepLink.pending else { return }
                deepLink.pending = nil
                openedLesson = OpenedLesson(id: id)
            }
            .navigationDestination(for: PathRoute.self) { route in
                PathScreen(route: route, session: session, course: course) { lessonID in
                    openedLesson = OpenedLesson(id: lessonID)
                }
            }
            .sheet(isPresented: $showingPathBuild, onDismiss: {
                // The goal may have been built, changed or removed: the rail card and any open detail read it again.
                pathReloadToken += 1
                Task { await railPath?.load() }
            }) {
                PathBuildView(session: session, course: course) { lessonID in
                    openedLesson = OpenedLesson(id: lessonID)
                }
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView(session: session, syncQueueStore: syncQueueStore)
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
            // No scroll to "continue" on first show: the status row and the hero are the top of the screen, and
            // Jump to current is the way down.
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
        // A pick made while this read was out is newer than whatever it returns.
        let picksBefore = levelPickNumber
        // A failed read keeps what is known; only an answer (a level, or none saved) replaces it.
        var answered = false
        var fetchedLevel: String?
        do {
            fetchedLevel = try await client.fetchCefrLevel(course: fetchedCourseCode)
            answered = true
        } catch {}
        guard !Task.isCancelled, course.code == fetchedCourseCode else { return }
        if answered, levelPickNumber == picksBefore, levelSavingCourse != fetchedCourseCode {
            if let level = fetchedLevel, !level.isEmpty {
                savedLevels[fetchedCourseCode] = level
                if selectedLevel != level { setLevelByApp(level) }
            } else {
                savedLevels[fetchedCourseCode] = nil
            }
        }
        // Most-recent-first: element 0 is "the last lesson completed,"
        // which is exactly what continueLessonID needs to find where to
        // scroll to next.
        let ids = (try? await client.fetchCompletedLessonIds(course: fetchedCourseCode)) ?? []
        guard !Task.isCancelled, course.code == fetchedCourseCode else { return }
        completedLessonIDs = Set(ids)
        mostRecentlyCompletedLessonID = ids.first
    }

    /// The band switch is instant (web's `pick()`), but the save is not fire-and-forget: the saved level is what
    /// start-lesson-session opens lessons from, so a lost save would leave the map offering lessons the server
    /// refuses. It is retried (LevelSave), and if it still fails the picker goes back to the level the server holds,
    /// with a line saying so. A newer pick replaces one still saving.
    private func saveLevel(_ level: String, previous: String) {
        guard session.accessToken != nil else { return }
        let savingCourse = course.code
        if levelSavingCourse == savingCourse { levelSaveTask?.cancel() }
        levelPickNumber += 1
        let pick = levelPickNumber
        levelSavingCourse = savingCourse
        levelSaveMessage = nil
        levelSaveTask = Task {
            // The token is fetched inside the retried closure, so a token that expired mid-retry is refreshed.
            let saved = await LevelSave.run {
                guard let accessToken = await session.freshAccessToken() else { throw URLError(.userAuthenticationRequired) }
                let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
                try await client.setCefrLevel(course: savingCourse, level: level)
            }
            // A save that landed is recorded per course even when a newer pick superseded it: the server holds it.
            if saved, pick != levelPickNumber { savedLevels[savingCourse] = level }
            // A newer pick took over (and cancelled this one if it was for the same course).
            guard pick == levelPickNumber else { return }
            levelSaveTask = nil
            levelSavingCourse = nil
            if saved { savedLevels[savingCourse] = level }
            guard course.code == savingCourse else { return }
            if saved {
                // Back on this course after leaving it mid-save: the load skipped the level, so show the saved one.
                if selectedLevel != level { setLevelByApp(level) }
            } else if selectedLevel == level {
                let back = savedLevels[savingCourse] ?? previous
                guard back != level else { return }
                setLevelByApp(back)
                levelSaveMessage = LevelSave.failedMessage
            }
        }
    }

    private func setLevelByApp(_ level: String) {
        levelSetByApp = level
        selectedLevel = level
    }

    /// A failed read keeps the last good list (never "nothing this week") and raises the retry. A cancelled load
    /// leaves the section as it was.
    private func loadChallenges() async {
        guard let accessToken = await session.freshAccessToken() else {
            challengesReadFailed = true
            return
        }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            let result = try await client.getWeeklyChallenges()
            guard !Task.isCancelled else { return }
            challenges = result
            challengesReadFailed = false
        } catch {
            guard !Task.isCancelled else { return }
            challengesReadFailed = true
        }
    }

    /// Quests are per course (the lessons quest counts this course's lessons). A failed read keeps this course's last
    /// good list and raises the retry; switching course starts from an empty list.
    private func loadQuests() async {
        let loadingCourse = course.code
        if questsCourse != loadingCourse {
            quests = []
            questsCourse = loadingCourse
        }
        questNotice = nil
        guard let accessToken = await session.freshAccessToken() else {
            questsReadFailed = true
            return
        }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            let result = try await client.getWeeklyQuests(course: loadingCourse, weekStart: WeeklyQuests.weekStart())
            guard !Task.isCancelled, course.code == loadingCourse else { return }
            quests = result
            questsReadFailed = false
        } catch {
            guard !Task.isCancelled, course.code == loadingCourse else { return }
            questsReadFailed = true
        }
    }

    /// Claims a finished quest with its weekly_quests id (never a challenge template id). The server enforces one
    /// claim per quest per week; a refusal is shown with its own reason, not as a connection problem.
    private func claimQuest(_ quest: WeeklyQuest) async {
        guard claimingQuestID == nil, quest.claimable else { return }
        claimingQuestID = quest.id
        defer { claimingQuestID = nil }
        let claimCourse = course.code
        guard let accessToken = await session.freshAccessToken() else {
            questNotice = "Check your connection and try again."
            return
        }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            let result = try await client.claimWeeklyQuest(questID: quest.id, course: claimCourse, weekStart: WeeklyQuests.weekStart())
            if result.ok {
                questNotice = "+\(quest.xpReward) XP claimed!"
                if let latest = try? await client.fetchProgress(course: claimCourse) {
                    syncQueueStore.updateLastKnownProgress(latest)
                }
            } else {
                questNotice = WeeklyQuests.claimMessage(reason: result.reason)
            }
            // Re-read either way: a refusal usually means the list on screen was stale.
            if course.code == claimCourse {
                quests = (try? await client.getWeeklyQuests(course: claimCourse, weekStart: WeeklyQuests.weekStart())) ?? quests
            }
        } catch {
            questNotice = "Check your connection and try again."
        }
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

/// The units header: the band's name and how far through it the learner is, with the level picker as a compact menu
/// (web: the select beside the same heading). A menu, not a row of capsules: five bands at once was the clutter.
private struct LearnUnitsHeader: View {
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Binding var selectedLevel: String
    let done: Int
    let total: Int

    private var name: String {
        LessonBrowserView.levels.first { $0.id == selectedLevel }?.name ?? ""
    }

    private var percent: Int { total > 0 ? Int((Double(done) / Double(total) * 100).rounded()) : 0 }

    var body: some View {
        // At accessibility sizes the menu drops under the title, so neither is cut off.
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: AlphonsoSpacing.xs))
            : AnyLayout(HStackLayout(alignment: .center, spacing: AlphonsoSpacing.sm))
        layout {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(selectedLevel) \u{00B7} \(name)")
                    .dsText(.headline)
                    .foregroundStyle(ds.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(percent)% complete")
                    .dsText(.caption)
                    .monospacedDigit()
                    .foregroundStyle(ds.inkSoft)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            Menu {
                Picker("Level", selection: $selectedLevel) {
                    ForEach(LessonBrowserView.levels, id: \.id) { level in
                        Text("\(level.id) \u{00B7} \(level.name)").tag(level.id)
                    }
                }
            } label: {
                HStack(spacing: AlphonsoSpacing.xs) {
                    Text(selectedLevel).dsText(.footnote)
                    Image(systemName: "chevron.down").font(.caption2.weight(.bold))
                }
                .foregroundStyle(ds.ink)
                .padding(.horizontal, AlphonsoSpacing.sm + 2)
                .frame(minHeight: AlphonsoSpacing.minTouchTarget)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card.opacity(0.94)))
                .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
            }
            .accessibilityLabel("Level: \(selectedLevel), \(name)")
            .accessibilityHint("Double tap to change level")
        }
        .padding(.horizontal, AlphonsoSpacing.md)
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

/// A read of the weekly card failed: say so and offer Try again, as the web does; what loaded before stays below it.
private struct WeeklyLoadFailedSection: View {
    @Environment(\.alphonsoDS) private var ds
    let onRetry: () -> Void

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text("Couldn't load this week's challenges and quests.")
                    .dsText(.footnote)
                    .foregroundStyle(ds.inkSoft)
                Button("Try again", action: onRetry)
                    .buttonStyle(.borderedProminent)
            }
            .padding(.vertical, 2)
        }
        .listRowBackground(ds.choiceTint)
    }
}

/// This week's quests (weekly_quests): the challenges' look, plus a Claim button on a finished, unclaimed one.
private struct WeeklyQuestsSection: View {
    @Environment(\.alphonsoDS) private var ds
    let quests: [WeeklyQuest]
    let notice: String?
    let claimingID: String?
    let onClaim: (WeeklyQuest) -> Void

    var body: some View {
        if !quests.isEmpty {
            Section {
                ForEach(quests) { q in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(q.title) (+\(q.xpReward) XP)")
                            .dsText(.footnote)
                            .strikethrough(q.claimed)
                            .foregroundStyle(q.claimed ? ds.inkSoft : ds.ink)
                        AlphonsoProgressBar(progress: Double(min(q.progress, q.target)) / Double(max(q.target, 1)))
                        HStack {
                            Text("\(min(q.progress, q.target))/\(q.target)")
                                .dsText(.caption)
                                .foregroundStyle(ds.inkSoft)
                            Spacer()
                            if q.claimable {
                                Button(claimingID == q.id ? "Claiming..." : "Claim") { onClaim(q) }
                                    .disabled(claimingID != nil)
                                    .buttonStyle(.borderedProminent)
                                    .accessibilityLabel("Claim \(q.title), \(q.xpReward) XP")
                            } else if q.claimed {
                                Text("Claimed")
                                    .dsText(.footnote)
                                    .foregroundStyle(ds.action)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
                if let notice {
                    Text(notice)
                        .dsText(.footnote)
                        .foregroundStyle(ds.ink)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            } header: {
                Text("This week's quests")
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
    let style: PlacementOffer.Style
    let onStart: () -> Void
    let onNotNow: () -> Void

    var body: some View {
        if style == .prominent {
            PlacementOfferCard(onStart: onStart, onNotNow: onNotNow)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        } else if style == .quiet {
            Section {
                Button(action: onStart) {
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
