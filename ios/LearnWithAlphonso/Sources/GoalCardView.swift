import SwiftUI
import LearnWithAlphonsoKit

/// The learning goal on the Learn tab (BACKLOG 0.0-ac #8, docs/superpowers/specs/
/// 2026-10-05-learning-goal-planner-design.md). It renders what `/api/learning-goal` returns and does no
/// plan maths of its own: the server's `planGoal` is the single implementation and the web card shows the
/// same numbers. Every string comes from `GoalCopy` (word-for-word the web card's wording), every request
/// from `LearningGoalClient`, and the offline copy from `GoalCache`, all tested in the Kit. This layer only
/// lays them out, and is compiled by CI's ios-app-build but NOT run on a device by the change that added it.
struct GoalCardView: View {
    let session: Session
    let course: Course

    private enum Phase { case loading, empty, goal, failed }

    @State private var phase: Phase = .loading
    @State private var state = LearningGoalState(goal: nil, plan: nil)
    @State private var loadError: LearningGoalError?
    @State private var actionError: String?
    @State private var showingSetup = false
    /// Bumped by every load and remove. A request that finishes after a newer one started (or after the
    /// course changed) sees a different number and drops its result. `courseCode` cannot do this job: it
    /// is derived from the same `course` the running closure captured, so comparing it was always true.
    @State private var generation = 0

    private var courseCode: String { course.translationCourseCode }

    /// Editing is disabled while showing a cached plan: the change could not be saved.
    private var offline: Bool { phase == .goal && loadError == .offline }

    var body: some View {
        Group {
            Section {
                content
            } header: {
                Text("Learning goal")
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .tracking(0.4)
                    .foregroundStyle(AlphonsoColor.ember)
            }
            .listRowBackground(AlphonsoColor.parchment)
        }
        // Reloads when the course changes; the previous course's slow answer is ignored in `load()`.
        .task(id: courseCode) { await load() }
        .sheet(isPresented: $showingSetup) {
            GoalSetupSheet(session: session, courseCode: courseCode, existing: state.goal) { saved in
                state = saved
                loadError = nil
                actionError = nil
                phase = saved.goal == nil ? .empty : .goal
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            ProgressView("Loading your goal\u{2026}")
                .tint(AlphonsoColor.moss)
        case .failed:
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                Text(GoalCopy.loadFailureMessage(loadError ?? .unavailable, hadCachedPlan: false))
                    .font(AlphonsoFont.sans(14, weight: .medium))
                    .foregroundStyle(AlphonsoColor.destructive)
                Button("Try again") { Task { await load() } }
                    .buttonStyle(.alphonsoSecondary)
            }
        case .empty:
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                Text("Set a target level and date and we'll work out how many lessons a week it takes.")
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                Button("Set a learning goal") { showingSetup = true }
                    .buttonStyle(.alphonsoPrimary)
            }
        case .goal:
            goalBody
        }
    }

    @ViewBuilder
    private var goalBody: some View {
        if let goal = state.goal {
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                Text(GoalCopy.headline(for: goal))
                    .font(AlphonsoFont.display(18, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)

                if let plan = state.plan {
                    AlphonsoProgressBar(
                        progress: Double(plan.lessonsInScope - plan.lessonsRemaining) / Double(max(plan.lessonsInScope, 1)))
                    Text(GoalCopy.progress(for: plan))
                        .font(AlphonsoFont.sans(13))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                    // Status is words, never colour alone.
                    Text(GoalCopy.statusLine(for: plan.status))
                        .font(AlphonsoFont.sans(15, weight: .semiBold))
                        .foregroundStyle(AlphonsoColor.ink)
                    if let weekly = GoalCopy.weeklyLine(for: plan) {
                        Text(weekly).font(AlphonsoFont.sans(13)).foregroundStyle(AlphonsoColor.inkSoft)
                    }
                    if let suggestion = GoalCopy.suggestionLine(for: plan) {
                        Text(suggestion).font(AlphonsoFont.sans(13)).foregroundStyle(AlphonsoColor.inkSoft)
                    }
                    if let realism = GoalCopy.realismLine(for: plan) {
                        Text(realism).font(AlphonsoFont.sans(13, weight: .medium)).foregroundStyle(AlphonsoColor.ember)
                    }
                } else {
                    // The learner's level has passed this target.
                    Text("Your level has passed this target. Pick a new target.")
                        .font(AlphonsoFont.sans(14))
                        .foregroundStyle(AlphonsoColor.ink)
                }

                if offline {
                    Text(offlineNote)
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
                if let actionError {
                    Text(actionError)
                        .font(AlphonsoFont.sans(13, weight: .medium))
                        .foregroundStyle(AlphonsoColor.destructive)
                }
                Text(GoalCopy.estimateNote)
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)

                HStack(spacing: AlphonsoSpacing.sm) {
                    Button("Change goal") { actionError = nil; showingSetup = true }
                        .buttonStyle(.alphonsoSecondary)
                        .disabled(offline)
                    Button("Remove goal") { Task { await remove() } }
                        .buttonStyle(.alphonsoSecondary)
                        .disabled(offline)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Learning goal")
        }
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
            Form {
                Section {
                    Picker("Finish level", selection: $level) {
                        ForEach(Self.levels, id: \.self) { Text($0).tag($0) }
                    }
                    DatePicker(
                        "Target date", selection: $date,
                        in: (GoalCopy.date(fromDay: GoalCopy.tomorrow()) ?? Date())...,
                        displayedComponents: .date)
                        .environment(\.calendar, utcCalendar)
                        .environment(\.timeZone, TimeZone(identifier: "UTC")!)
                    HStack {
                        ForEach([3, 6, 12], id: \.self) { months in
                            Button("\(months) months") {
                                date = GoalCopy.date(fromDay: GoalCopy.monthsFromToday(months)) ?? date
                            }
                            .buttonStyle(.bordered)
                            .tint(AlphonsoColor.moss)
                        }
                    }
                }

                Section {
                    previewContent
                    Text(GoalCopy.estimateNote)
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }

                if let saveError {
                    Section { Text(saveError).foregroundStyle(AlphonsoColor.destructive) }
                }
            }
            .navigationTitle("Set a learning goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save goal") { Task { await save() } }
                        .disabled(!canSave)
                }
            }
            // A newer selection cancels this task, so an older, slower preview can never replace it.
            .task(id: level + "|" + day) { await loadPreview() }
        }
        .tint(AlphonsoColor.moss)
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder
    private var previewContent: some View {
        switch preview {
        case .loading:
            ProgressView("Working it out\u{2026}").tint(AlphonsoColor.moss)
        case .failed(let message):
            Text(message).foregroundStyle(AlphonsoColor.destructive)
        case .ok(let plan):
            let lines = GoalCopy.previewLines(for: plan)
            VStack(alignment: .leading, spacing: 4) {
                Text(lines.perWeek).font(AlphonsoFont.sans(16, weight: .semiBold)).foregroundStyle(AlphonsoColor.ink)
                Text(lines.left).font(AlphonsoFont.sans(13)).foregroundStyle(AlphonsoColor.inkSoft)
                if let suggestion = GoalCopy.suggestionLine(for: plan) {
                    Text(suggestion).font(AlphonsoFont.sans(13)).foregroundStyle(AlphonsoColor.inkSoft)
                }
                if let realism = GoalCopy.realismLine(for: plan) {
                    Text(realism).font(AlphonsoFont.sans(13, weight: .medium)).foregroundStyle(AlphonsoColor.ember)
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
