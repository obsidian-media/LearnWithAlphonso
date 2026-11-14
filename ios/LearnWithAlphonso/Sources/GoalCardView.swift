import SwiftUI
import LearnWithAlphonsoKit

/// The learning goal on Build my path (BACKLOG 0.0-ac #8, docs/superpowers/specs/
/// 2026-10-05-learning-goal-planner-design.md). It renders what `/api/learning-goal` returns and does no
/// plan maths of its own: the server's `planGoal` is the single implementation and the web card shows the
/// same numbers. Every string comes from `GoalCopy` (word-for-word the web card's wording), every request
/// from `LearningGoalClient`, and the offline copy from `GoalCache`, all tested in the Kit. This layer only
/// lays them out, in the round-6 design system: the goal is the navy hero the My path card uses.
struct GoalCardView: View {
    let session: Session
    let course: Course
    /// Called after the goal was saved or removed, so a screen built on it (Build my path) can reload.
    var onChanged: () -> Void = {}

    private enum Phase { case loading, empty, goal, failed }

    @State private var phase: Phase = .loading
    @State private var state = LearningGoalState(goal: nil, plan: nil)
    @State private var loadError: LearningGoalError?
    @State private var actionError: String?
    @State private var showingSetup = false
    /// Why the learner is here (their first-run answer), for the first goal chip; nil when never answered.
    @State private var purposeID: String?
    /// Bumped by every load and remove. A request that finishes after a newer one started (or after the
    /// course changed) sees a different number and drops its result. `courseCode` cannot do this job: it
    /// is derived from the same `course` the running closure captured, so comparing it was always true.
    @State private var generation = 0

    @Environment(\.alphonsoDS) private var ds

    private var courseCode: String { course.translationCourseCode }

    /// Editing is disabled while showing a cached plan: the change could not be saved.
    private var offline: Bool { phase == .goal && loadError == .offline }

    var body: some View {
        // The loader is on this container, which always draws (a card in every phase), never on conditional
        // content that can draw nothing.
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
            DSOverline("Learning goal")
            content
        }
        // Reloads when the course changes; the previous course's slow answer is ignored in `load()`.
        .task(id: courseCode) {
            await load()
            // Deliberately silent on failure: without the answer the chip is simply left out.
            purposeID = try? await learnerProfileClient(session)?.fetch().answers.goal
        }
        .sheet(isPresented: $showingSetup) {
            GoalSetupSheet(session: session, courseCode: courseCode, existing: state.goal) { saved in
                state = saved
                loadError = nil
                actionError = nil
                phase = saved.goal == nil ? .empty : .goal
                onChanged()
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            DSCard {
                ProgressView("Loading your goal\u{2026}").tint(ds.choice)
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
        case .failed:
            DSCard {
                Text(GoalCopy.loadFailureMessage(loadError ?? .unavailable, hadCachedPlan: false))
                    .dsText(.footnote).foregroundStyle(ds.wrongInk)
                Button("Try again") { Task { await load() } }
                    .buttonStyle(.dsButton(.secondary, compact: true))
            }
        case .empty:
            DSCard {
                Text("Set a target level and date and we'll work out how many lessons a week it takes.")
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
                Button("Set a learning goal") { showingSetup = true }
                    .buttonStyle(.dsButton(.primary))
            }
        case .goal:
            goalBody
        }
    }

    @ViewBuilder
    private var goalBody: some View {
        if let goal = state.goal {
            // Round 8 A0: the goal as chips (purpose, level, date); a tap changes it.
            DSCard(padding: AlphonsoDS.Space.s3, spacing: AlphonsoDS.Space.s2) {
                LessonFlowLayout {
                    ForEach(
                        PathGoalChips.labels(purposeID: purposeID, targetLevel: goal.targetLevel, targetDate: goal.targetDate),
                        id: \.self
                    ) { label in
                        DSChip(label, selected: true) { actionError = nil; showingSetup = true }
                            .disabled(offline)
                    }
                }
                Text(PathGoalChips.note).dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            DSHeroCard(spacing: AlphonsoDS.Space.s2) {
                Text(GoalCopy.headline(for: goal)).dsText(.title)

                if let plan = state.plan {
                    DSProgressBar(
                        fraction: Double(plan.lessonsInScope - plan.lessonsRemaining) / Double(max(plan.lessonsInScope, 1)),
                        onHero: true)
                    Text(GoalCopy.progress(for: plan)).dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                    // Status is words, never colour alone.
                    Text(GoalCopy.statusLine(for: plan.status)).dsText(.headline)
                    if let weekly = GoalCopy.weeklyLine(for: plan) {
                        Text(weekly).dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                    }
                    if let suggestion = GoalCopy.suggestionLine(for: plan) {
                        Text(suggestion).dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                    }
                    if let realism = GoalCopy.realismLine(for: plan) {
                        Text(realism).dsText(.footnote).foregroundStyle(ds.onHeroKick)
                    }
                } else {
                    // The learner's level has passed this target.
                    Text("Your level has passed this target. Pick a new target.").dsText(.footnote)
                }

                if offline {
                    Text(offlineNote).dsText(.caption).foregroundStyle(ds.onHeroSoft)
                }
                Text(GoalCopy.estimateNote).dsText(.caption).foregroundStyle(ds.onHeroSoft)

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: AlphonsoDS.Space.s3) { goalButtons }
                    VStack(spacing: AlphonsoDS.Space.s2) { goalButtons }
                }
                .padding(.top, AlphonsoDS.Space.s1)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Learning goal")
            if let actionError {
                DSCard {
                    Text(actionError).dsText(.footnote).foregroundStyle(ds.wrongInk)
                }
            }
        }
    }

    @ViewBuilder
    private var goalButtons: some View {
        Button("Change goal") { actionError = nil; showingSetup = true }
            .buttonStyle(.dsButton(.secondary, compact: true))
            .disabled(offline)
        Button("Remove goal") { Task { await remove() } }
            .buttonStyle(.dsButton(.secondary, compact: true))
            .disabled(offline)
    }

    private var offlineNote: String {
        var note = LearningGoalError.offline.userMessage
        if let plan = state.plan { note += " As of \(GoalCopy.formatDate(String(plan.asOf.prefix(10))))." }
        return note
    }

    // MARK: - Loading

    private func makeClient(token: String) -> LearningGoalClient {
        LearningGoalClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { token },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
    }

    private func load() async {
        let code = courseCode
        generation += 1
        let mine = generation
        phase = .loading
        loadError = nil
        actionError = nil
        guard let userID = session.userID, let token = await session.freshAccessToken() else {
            loadError = .notSignedIn
            phase = .failed
            return
        }
        do {
            let next = try await makeClient(token: token).fetch(course: code)
            // A slow answer for a course the learner has since left must not overwrite the card.
            guard mine == generation, !Task.isCancelled else { return }
            state = next
            GoalCache().write(next, userID: userID, course: code)
            phase = next.goal == nil ? .empty : .goal
        } catch {
            guard mine == generation, !Task.isCancelled else { return }
            let failure = (error as? LearningGoalError) ?? .unavailable
            loadError = failure
            // The cached plan is only for being OFFLINE; a 401 or a server error never shows it.
            if failure == .offline, let cached = GoalCache().read(userID: userID, course: code) {
                state = cached
                phase = .goal
            } else {
                phase = .failed
            }
        }
    }

    private func remove() async {
        let code = courseCode
        generation += 1
        let mine = generation
        guard let userID = session.userID, let token = await session.freshAccessToken() else {
            actionError = GoalCopy.actionFailureMessage(.notSignedIn)
            return
        }
        do {
            try await makeClient(token: token).remove(course: code)
            GoalCache().clear(userID: userID, course: code)
            // The delete happened either way; only touch the screen if it still shows this request's course.
            guard mine == generation else { return }
            state = LearningGoalState(goal: nil, plan: nil)
            actionError = nil
            phase = .empty
            onChanged()
        } catch {
            guard mine == generation else { return }
            // A failed remove is an action error, not "offline": the goal is still there and editable.
            actionError = GoalCopy.actionFailureMessage((error as? LearningGoalError) ?? .unavailable)
        }
    }
}

/// Setting or changing the goal: a level, a date (3/6/12-month presets), and a live preview of the
/// lessons a week it takes. Save is only possible once a preview for the CURRENT selection has arrived.
private struct GoalSetupSheet: View {
    let session: Session
    let courseCode: String
    let existing: StoredGoal?
    let onSaved: (LearningGoalState) -> Void

    private enum Preview { case loading, ok(GoalPlan), failed(String) }

    @Environment(\.dismiss) private var dismiss
    @Environment(\.alphonsoDS) private var ds
    @State private var level: String
    @State private var date: Date
    @State private var preview: Preview = .loading
    @State private var saving = false
    @State private var saveError: String?

    private static let levels = ["A1", "A2", "B1", "B2", "C1"]
    private var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    init(session: Session, courseCode: String, existing: StoredGoal?, onSaved: @escaping (LearningGoalState) -> Void) {
        self.session = session
        self.courseCode = courseCode
        self.existing = existing
        self.onSaved = onSaved
        _level = State(initialValue: existing?.targetLevel ?? "B1")
        _date = State(
            initialValue: GoalCopy.date(fromDay: existing?.targetDate ?? GoalCopy.monthsFromToday(6)) ?? Date())
    }

    private var day: String { GoalCopy.day(from: date) }
    private var canSave: Bool {
        if case .ok = preview { return !saving }
        return false
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                    DSOverline("Finish level")
                    LessonFlowLayout {
                        ForEach(Self.levels, id: \.self) { value in
                            DSChip(value, selected: level == value) { level = value }
                        }
                    }

                    DSOverline("Target date")
                    DSCard {
                        DatePicker(
                            "Target date", selection: $date,
                            in: (GoalCopy.date(fromDay: GoalCopy.tomorrow()) ?? Date())...,
                            displayedComponents: .date)
                            .dsText(.headline)
                            .foregroundStyle(ds.ink)
                            .environment(\.calendar, utcCalendar)
                            .environment(\.timeZone, TimeZone(identifier: "UTC")!)
                        LessonFlowLayout {
                            ForEach([3, 6, 12], id: \.self) { months in
                                DSChip(
                                    "\(months) months",
                                    selected: day == GoalCopy.monthsFromToday(months)
                                ) {
                                    date = GoalCopy.date(fromDay: GoalCopy.monthsFromToday(months)) ?? date
                                }
                            }
                        }
                    }

                    previewContent
                    Text(GoalCopy.estimateNote).dsText(.caption).foregroundStyle(ds.inkSoft)

                    if let saveError {
                        DSCard { Text(saveError).dsText(.footnote).foregroundStyle(ds.wrongInk) }
                    }
                }
                .padding(AlphonsoDS.Space.gutter)
            }
            .background(ds.surface)
            .navigationTitle("Set a learning goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button("Save goal") { Task { await save() } }
                    .buttonStyle(.dsButton(.primary))
                    .disabled(!canSave)
                    .padding(.horizontal, AlphonsoDS.Space.gutter)
                    .padding(.top, AlphonsoDS.Space.s3)
                    .padding(.bottom, AlphonsoDS.Space.s2)
                    .background(ds.surface)
            }
            // A newer selection cancels this task, so an older, slower preview can never replace it.
            .task(id: level + "|" + day) { await loadPreview() }
        }
        .tint(ds.choice)
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder
    private var previewContent: some View {
        switch preview {
        case .loading:
            DSCard {
                ProgressView("Working it out\u{2026}").tint(ds.choice)
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
        case .failed(let message):
            DSCard { Text(message).dsText(.footnote).foregroundStyle(ds.wrongInk) }
        case .ok(let plan):
            let lines = GoalCopy.previewLines(for: plan)
            DSHeroCard {
                Text(lines.perWeek).dsText(.title)
                Text(lines.left).dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                if let suggestion = GoalCopy.suggestionLine(for: plan) {
                    Text(suggestion).dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                }
                if let realism = GoalCopy.realismLine(for: plan) {
                    Text(realism).dsText(.footnote).foregroundStyle(ds.onHeroKick)
                }
            }
        }
    }

    private func client(token: String) -> LearningGoalClient {
        LearningGoalClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { token },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
    }

    private func loadPreview() async {
        preview = .loading
        guard let token = await session.freshAccessToken() else {
            preview = .failed(LearningGoalError.notSignedIn.userMessage)
            return
        }
        do {
            let plan = try await client(token: token).preview(course: courseCode, targetLevel: level, targetDate: day)
            guard !Task.isCancelled else { return }
            preview = .ok(plan)
        } catch {
            guard !Task.isCancelled else { return }
            preview = .failed(((error as? LearningGoalError) ?? .unavailable).userMessage)
        }
    }

    private func save() async {
        guard canSave, let userID = session.userID else { return }
        saving = true
        saveError = nil
        defer { saving = false }
        guard let token = await session.freshAccessToken() else {
            saveError = LearningGoalError.notSignedIn.userMessage
            return
        }
        do {
            let saved = try await client(token: token).save(course: courseCode, targetLevel: level, targetDate: day)
            GoalCache().write(saved, userID: userID, course: courseCode)
            onSaved(saved)
            dismiss()
        } catch {
            saveError = GoalCopy.actionFailureMessage((error as? LearningGoalError) ?? .unavailable)
        }
    }
}
