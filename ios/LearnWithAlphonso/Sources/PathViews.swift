import SwiftUI
import LearnWithAlphonsoKit

/// The learning path on iOS (mock: mocks-r8 Feature 2, layout A "the road", with B's week view and "Why this mix" as
/// secondary screens, plus the Profile "My path" card and per-type tiles). It renders what `/api/learning-path`
/// returns (decoded and tested in the Kit: LearningPath.swift) and does no plan maths of its own: the server's
/// `planPath` is the single implementation and the web screens show the same plan. Every colour and text style is a
/// design token. This layer is compiled by CI's ios-app-build but NOT run on a device by the change that added it.

/// Where the Learn tab pushes the path screens.
enum PathRoute: Hashable { case road, week, why }

/// One screen's copy of the path: loads, applies a change, and reports failures in words.
@MainActor
@Observable
final class PathModel {
    enum Phase { case loading, none, ready(LearningPath), failed(LearningPathError) }

    var phase: Phase = .loading
    var busy = false
    var actionError: String?

    private let session: Session
    private let courseCode: String
    /// Bumped by every request; an older answer (or one for a course the learner left) is dropped.
    private var generation = 0

    init(session: Session, courseCode: String) {
        self.session = session
        self.courseCode = courseCode
    }

    var path: LearningPath? {
        if case .ready(let path) = phase { return path }
        return nil
    }

    private func client(token: String) -> LearningPathClient {
        let session = self.session
        return LearningPathClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { token },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
    }

    func load() async {
        generation += 1
        let mine = generation
        phase = .loading
        guard let token = await session.freshAccessToken() else {
            phase = .failed(.notSignedIn)
            return
        }
        do {
            let next = try await client(token: token).fetch(course: courseCode)
            guard mine == generation, !Task.isCancelled else { return }
            phase = next.map { .ready($0) } ?? .none
        } catch {
            guard mine == generation, !Task.isCancelled else { return }
            phase = .failed((error as? LearningPathError) ?? .unavailable)
        }
    }

    func apply(_ change: LearningPathChange) async {
        generation += 1
        let mine = generation
        busy = true
        actionError = nil
        defer { busy = false }
        guard let token = await session.freshAccessToken() else {
            actionError = LearningPathError.notSignedIn.userMessage
            return
        }
        do {
            let next = try await client(token: token).change(course: courseCode, change)
            guard mine == generation else { return }
            phase = next.map { .ready($0) } ?? .none
        } catch {
            guard mine == generation else { return }
            actionError = ((error as? LearningPathError) ?? .unavailable) == .offline
                ? "You are offline. Try again when connected." : "That could not be saved. Try again."
        }
    }
}

// MARK: - Pieces

struct PathTypeBadge: View {
    let kind: PathKind
    var small = false
    @Environment(\.alphonsoDS) private var ds

    private var symbol: String {
        switch kind {
        case .lesson: return "book.fill"
        case .podcast: return "headphones"
        case .talk: return "mic.fill"
        case .campaign: return "star.fill"
        case .unknown: return "circle.fill"
        }
    }
    private var fill: Color {
        switch kind {
        case .lesson: return ds.choice
        case .podcast: return ds.hero
        case .talk: return ds.xp
        case .campaign: return ds.right
        case .unknown: return ds.line
        }
    }
    private var glyph: Color {
        switch kind {
        case .talk: return ds.ink
        case .campaign: return ds.onRight
        default: return ds.card
        }
    }

    var body: some View {
        let size = small ? AlphonsoDS.Space.s6 + AlphonsoDS.Space.s1 : AlphonsoDS.Space.minTouch - AlphonsoDS.Space.s1
        Image(systemName: symbol)
            .imageScale(small ? .small : .medium)
            .foregroundStyle(glyph)
            .frame(width: size, height: size)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(fill))
            .accessibilityHidden(true)
    }
}

/// A thin capsule bar with a token fill (the lesson and minutes progress).
struct PathBar: View {
    let fraction: Double
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(ds.onHeroSoft.opacity(0.3))
                Capsule().fill(ds.xp).frame(width: proxy.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: AlphonsoDS.Space.s2)
        .accessibilityHidden(true)
    }
}

struct PathItemRow: View {
    let item: PathItem
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let done = item.state == "done"
        HStack(spacing: AlphonsoDS.Space.s3) {
            PathTypeBadge(kind: item.kind)
            VStack(alignment: .leading, spacing: 0) {
                Text(item.title).dsText(.headline).foregroundStyle(ds.ink).lineLimit(1)
                Text(item.subtitle).dsText(.caption).foregroundStyle(ds.inkSoft).lineLimit(1)
            }
            Spacer(minLength: AlphonsoDS.Space.s2)
            Text("\(done ? "\u{2713} " : "")\(item.minutes) min")
                .dsText(.caption)
                .foregroundStyle(done ? ds.rightInk : ds.inkSoft)
        }
        .padding(.vertical, AlphonsoDS.Space.s1)
        .frame(minHeight: AlphonsoDS.Space.minTouch)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(item.kind.noun): \(item.title), \(item.minutes) minutes\(done ? ", done" : item.state == "next" ? ", next" : "")")
    }
}

struct PathMixBar: View {
    let mix: [PathMixEntry]
    @Environment(\.alphonsoDS) private var ds

    private func color(_ kind: PathKind) -> Color {
        switch kind {
        case .lesson: return ds.choice
        case .podcast: return ds.hero
        case .talk: return ds.xp
        case .campaign: return ds.right
        case .unknown: return ds.line
        }
    }

    var body: some View {
        let shown = mix.filter { $0.minutes > 0 }
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            GeometryReader { proxy in
                HStack(spacing: AlphonsoDS.Space.s1 / 2) {
                    ForEach(Array(shown.enumerated()), id: \.offset) { _, entry in
                        let total = Double(max(shown.map(\.minutes).reduce(0, +), 1))
                        Rectangle().fill(color(entry.kind))
                            .frame(width: max(0, proxy.size.width * Double(entry.minutes) / total))
                    }
                }
                .clipShape(Capsule())
            }
            .frame(height: AlphonsoDS.Space.s3)
            Text(shown.map { "\($0.kind.label) \($0.minutes) min" }.joined(separator: " \u{00B7} "))
                .dsText(.caption).foregroundStyle(ds.inkSoft)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Weekly mix: " + shown.map { "\($0.kind.label) \($0.minutes) minutes" }.joined(separator: ", "))
    }
}

// MARK: - Learn: the path card with today's list (A1)

struct PathCardSection: View {
    let session: Session
    let course: Course
    let onBuild: () -> Void
    @State private var model: PathModel?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Section {
            content
        } header: {
            Text("My path").dsText(.overline).foregroundStyle(ds.actionText)
        }
        .task(id: course.translationCourseCode) {
            let made = PathModel(session: session, courseCode: course.translationCourseCode)
            model = made
            await made.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model?.phase ?? .loading {
        case .loading:
            ProgressView("Loading your path\u{2026}").tint(ds.choice)
        case .failed(let error):
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                Text(error.userMessage).dsText(.footnote).foregroundStyle(ds.wrongInk)
                Button("Try again") { Task { await model?.load() } }.buttonStyle(.alphonsoSecondary)
            }
        case .none:
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                Text("Pick a level and a date and we will build a daily plan of lessons, podcasts, talks and story campaigns.")
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
                Button("Build my path") { onBuild() }.buttonStyle(.alphonsoPrimary)
            }
        case .ready(let path):
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                NavigationLink(value: PathRoute.road) {
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                        Text("Finish \(path.goalLabel)").dsText(.overline).foregroundStyle(ds.onHeroKick)
                        Text(path.statusLine).dsText(.title).foregroundStyle(ds.onHero)
                        PathBar(fraction: path.lessonFraction)
                        Text("\(path.progress.lessonsDone) of \(path.progress.lessonsInScope) lessons")
                            .dsText(.caption).foregroundStyle(ds.onHeroSoft)
                    }
                    .padding(AlphonsoDS.Space.s3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.hero))
                }
                .accessibilityLabel("My path: finish \(path.goalLabel). \(path.statusLine). Open")
                HStack {
                    Text("Today \u{00B7} \(path.today.targetMinutes) min").dsText(.headline).foregroundStyle(ds.ink)
                    Spacer()
                    Text(path.today.minutesLeft > 0 ? "\(path.today.minutesLeft) min left" : "Done for today")
                        .dsText(.caption).foregroundStyle(ds.inkSoft)
                }
                ForEach(Array(path.today.items.enumerated()), id: \.offset) { _, item in PathItemRow(item: item) }
                if path.today.items.isEmpty {
                    Text("Nothing planned today. Enjoy the rest.").dsText(.footnote).foregroundStyle(ds.inkSoft)
                }
                Text("Minutes are estimates from lesson length, episode length and typical call length.")
                    .dsText(.caption).foregroundStyle(ds.inkSoft)
            }
        }
    }
}

// MARK: - The road, week, why

/// The three secondary screens, one view with a mode, so they share the loading and failure handling.
struct PathScreen: View {
    let route: PathRoute
    let session: Session
    let course: Course
    var onOpenLesson: (String) -> Void = { _ in }
    @State private var model: PathModel?
    @State private var picked: String?
    @Environment(\.alphonsoDS) private var ds

    private var title: String {
        switch route {
        case .road: return model?.path.map { "My path to \($0.progress.targetLevel)" } ?? "My path"
        case .week: return "My week"
        case .why: return "Why this mix?"
        }
    }

    var body: some View {
        List {
            switch model?.phase ?? .loading {
            case .loading:
                ProgressView("Loading your path\u{2026}").tint(ds.choice)
            case .failed(let error):
                Text(error.userMessage).dsText(.footnote).foregroundStyle(ds.wrongInk)
                Button("Try again") { Task { await model?.load() } }.buttonStyle(.alphonsoSecondary)
            case .none:
                Text("You have no path yet. Build one from the Learn tab.").dsText(.footnote).foregroundStyle(ds.inkSoft)
            case .ready(let path):
                switch route {
                case .road: road(path)
                case .week: week(path)
                case .why: why(path)
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: course.translationCourseCode) {
            let made = PathModel(session: session, courseCode: course.translationCourseCode)
            model = made
            await made.load()
        }
    }

    // The road
    @ViewBuilder
    private func road(_ path: LearningPath) -> some View {
        Section {
            Text("\(path.dailyMinutes) min a day \u{00B7} by \(GoalCopy.formatDate(path.progress.targetDate))")
                .dsText(.footnote).foregroundStyle(ds.inkSoft)
        }
        if path.trimmed {
            Section {
                Text("Lessons first until \(path.trimUntil.map(GoalCopy.formatDate) ?? "you resume").")
                    .dsText(.footnote).foregroundStyle(ds.ink)
                Button("Resume my mix") { Task { await model?.apply(.resume) } }
                    .buttonStyle(.alphonsoSecondary).disabled(model?.busy ?? false)
            }
        }
        if path.status == "behind", !path.recovery.isEmpty { recovery(path) }
        Section {
            ForEach(Array(path.road.enumerated()), id: \.offset) { _, stop in stopRow(stop) }
        } header: {
            Text("Your road").dsText(.overline).foregroundStyle(ds.actionText)
        }
        Section {
            NavigationLink(value: PathRoute.week) { Text("This week").dsText(.headline).foregroundStyle(ds.ink) }
            NavigationLink(value: PathRoute.why) { Text("Why this mix?").dsText(.headline).foregroundStyle(ds.ink) }
        }
        Section {
            Text("Podcasts are in the Listen tab, talks and story campaigns in Practice.")
                .dsText(.caption).foregroundStyle(ds.inkSoft)
        }
    }

    @ViewBuilder
    private func stopRow(_ stop: PathStop) -> some View {
        let done = stop.state == "done"
        let isGoal = stop.kind == "goal"
        HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
            if done {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(ds.right).imageScale(.large)
                    .frame(width: AlphonsoDS.Space.minTouch - AlphonsoDS.Space.s1)
            } else if isGoal {
                Image(systemName: "flag.fill").foregroundStyle(ds.choice).imageScale(.large)
                    .frame(width: AlphonsoDS.Space.minTouch - AlphonsoDS.Space.s1)
            } else if let kind = stop.pathKind {
                PathTypeBadge(kind: kind)
            }
            VStack(alignment: .leading, spacing: 0) {
                if let kind = stop.pathKind, !isGoal {
                    Text(stop.note.isEmpty ? kind.noun : "\(kind.noun) \u{00B7} \(stop.note)")
                        .dsText(.overline).foregroundStyle(ds.actionText)
                }
                Text(stop.title).dsText(.headline).foregroundStyle(ds.ink)
                Text(stop.subtitle + (stop.estDate.map { " \u{00B7} est. \(GoalCopy.formatDate($0))" } ?? ""))
                    .dsText(.caption).foregroundStyle(ds.inkSoft)
            }
        }
        .frame(minHeight: AlphonsoDS.Space.minTouch)
        .contentShape(Rectangle())
        .onTapGesture {
            if let ref = stop.ref, ref.kind == "lesson", !done { onOpenLesson(ref.id) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(done ? "Done. " : stop.state == "current" ? "Next up. " : "")\(stop.title). \(stop.subtitle)")
    }

    @ViewBuilder
    private func recovery(_ path: LearningPath) -> some View {
        let chosenID = picked ?? path.recovery.first(where: \.suggested)?.id
        Section {
            Text(path.statusLine).dsText(.headline).foregroundStyle(ds.ink)
            Text(path.statusDetail).dsText(.footnote).foregroundStyle(ds.inkSoft)
            ForEach(path.recovery, id: \.id) { option in
                Button { picked = option.id } label: {
                    HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                        Image(systemName: option.id == chosenID ? "largecircle.fill.circle" : "circle")
                            .foregroundStyle(ds.choice)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(option.title + (option.suggested ? " (suggested)" : ""))
                                .dsText(.headline).foregroundStyle(ds.ink)
                            Text(option.detail).dsText(.caption).foregroundStyle(ds.inkSoft)
                        }
                    }
                    .frame(minHeight: AlphonsoDS.Space.minTouch)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(option.id == chosenID ? [.isSelected] : [])
            }
            if let mix = path.recovery.first(where: { $0.id == chosenID })?.mix { PathMixBar(mix: mix) }
            if let error = model?.actionError {
                Text(error).dsText(.footnote).foregroundStyle(ds.wrongInk)
            }
            Button("Update my path") { Task { await applyRecovery(path, id: chosenID) } }
                .buttonStyle(.alphonsoPrimary).disabled(model?.busy ?? false)
        }
    }

    private func applyRecovery(_ path: LearningPath, id: String?) async {
        guard let option = path.recovery.first(where: { $0.id == id }) else { return }
        switch option.id {
        case "lessons_first":
            await model?.apply(.lessonsFirst)
        case "add_minutes":
            if let minutes = option.dailyMinutes { await model?.apply(.setDailyMinutes(minutes)) }
        case "move_date":
            // The date is the goal's own: saved through the same route the goal card uses.
            guard let date = option.date, let token = await session.freshAccessToken() else { return }
            let goals = LearningGoalClient(
                baseURL: AppConfig.apiBaseURL, accessToken: { token },
                refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
            _ = try? await goals.save(
                course: course.translationCourseCode, targetLevel: path.progress.targetLevel, targetDate: date)
            await model?.load()
        default:
            break
        }
    }

    // The week
    @ViewBuilder
    private func week(_ path: LearningPath) -> some View {
        Section {
            Text("\(path.dailyMinutes) min a day \u{00B7} \(path.week.filter { $0.state != "rest" }.count) days \u{00B7} \(path.weekMinutes) min")
                .dsText(.footnote).foregroundStyle(ds.inkSoft)
            PathMixBar(mix: path.mix)
            Text("\(path.weekDoneMinutes) of \(path.weekMinutes) minutes done so far.")
                .dsText(.caption).foregroundStyle(ds.inkSoft)
        } header: {
            Text("This week's mix").dsText(.overline).foregroundStyle(ds.actionText)
        }
        Section {
            ForEach(Array(path.week.enumerated()), id: \.offset) { _, day in
                HStack(spacing: AlphonsoDS.Space.s2) {
                    Text(day.label).dsText(.headline).foregroundStyle(ds.ink)
                        .frame(width: AlphonsoDS.Space.s12)
                    ForEach(Array(day.items.enumerated()), id: \.offset) { _, item in
                        PathTypeBadge(kind: item.kind, small: true)
                    }
                    Spacer()
                    Text(day.state == "rest" ? "Rest day" : day.state == "missed" ? "Missed" : "\(day.minutes) min")
                        .dsText(.caption).foregroundStyle(ds.inkSoft)
                }
                .frame(minHeight: AlphonsoDS.Space.minTouch)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(
                    "\(day.label)\(day.state == "today" ? ", today" : ""): "
                        + (day.state == "rest" ? "rest day"
                            : day.items.isEmpty ? "nothing" : day.items.map { $0.kind.noun }.joined(separator: ", ")))
            }
        }
    }

    // Why this mix
    @ViewBuilder
    private func why(_ path: LearningPath) -> some View {
        Section {
            Text("Lessons are the backbone because you want to finish \(path.goalLabel). The rest follows what you told me and how you are doing.")
                .dsText(.footnote).foregroundStyle(ds.ink)
        }
        Section {
            ForEach(Array(path.why.enumerated()), id: \.offset) { _, entry in
                HStack(spacing: AlphonsoDS.Space.s3) {
                    PathTypeBadge(kind: entry.kind, small: true)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(entry.headline).dsText(.headline).foregroundStyle(ds.ink)
                        Text(entry.detail).dsText(.caption).foregroundStyle(ds.inkSoft)
                    }
                }
                .frame(minHeight: AlphonsoDS.Space.minTouch)
                .accessibilityElement(children: .combine)
            }
        }
        Section {
            Text("Change the minutes or turn a type off in Build my path. Your skill scores update the plan as you practise.")
                .dsText(.caption).foregroundStyle(ds.inkSoft)
        }
    }
}

// MARK: - Build my path (A0)

struct PathBuildView: View {
    let session: Session
    let course: Course
    @State private var model: PathModel?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        NavigationStack {
            List {
                // The goal, level and date: the same card the planner always had.
                // The goal card saves on its own button; reload so the switches appear once a goal exists.
                GoalCardView(session: session, course: course, onChanged: { Task { await model?.load() } })
                    .id(course.translationCourseCode)
                if let path = model?.path { switches(path) }
            }
            .navigationTitle("Build my path")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .task(id: course.translationCourseCode) {
                let made = PathModel(session: session, courseCode: course.translationCourseCode)
                model = made
                await made.load()
            }
        }
    }

    @ViewBuilder
    private func switches(_ path: LearningPath) -> some View {
        Section {
            Text("\(path.progress.requiredPerWeek) lessons a week").dsText(.headline).foregroundStyle(ds.ink)
            Text("\(path.dailyMinutes) minutes a day, 6 days. The rest of each day is filled with the mix below.")
                .dsText(.caption).foregroundStyle(ds.inkSoft)
            PathMixBar(mix: path.mix)
        } header: {
            Text("Your plan").dsText(.overline).foregroundStyle(ds.actionText)
        }
        Section {
            HStack(spacing: AlphonsoDS.Space.s3) {
                PathTypeBadge(kind: .lesson)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Lessons").dsText(.headline).foregroundStyle(ds.ink)
                    Text("Always on, the backbone").dsText(.caption).foregroundStyle(ds.inkSoft)
                }
            }
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            ForEach(PathKind.optional, id: \.wire) { kind in
                Toggle(isOn: Binding(
                    get: { !path.off.contains(kind.wire) },
                    set: { on in
                        let off = PathKind.optional.filter { k in
                            k == kind ? !on : path.off.contains(k.wire)
                        }
                        Task { await model?.apply(.setOff(off)) }
                    })
                ) {
                    HStack(spacing: AlphonsoDS.Space.s3) {
                        PathTypeBadge(kind: kind)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(kind.label).dsText(.headline).foregroundStyle(ds.ink)
                            Text(reason(for: kind, in: path)).dsText(.caption).foregroundStyle(ds.inkSoft)
                        }
                    }
                }
                .tint(ds.choice)
                .disabled(model?.busy ?? false)
                .accessibilityLabel("\(kind.label) in my path")
            }
            if let error = model?.actionError {
                Text(error).dsText(.footnote).foregroundStyle(ds.wrongInk)
            }
        } header: {
            Text("How I like to learn").dsText(.overline).foregroundStyle(ds.actionText)
        }
    }

    private func reason(for kind: PathKind, in path: LearningPath) -> String {
        if !path.off.contains(kind.wire),
           let why = path.why.first(where: { $0.kind == kind && $0.source != "planner" }) {
            return why.detail
        }
        switch kind {
        case .podcast: return "Listen and answer a short quiz"
        case .talk: return "Needs the microphone"
        default: return "Story scenes that run over several days"
        }
    }
}

// MARK: - Profile: My path card and per-type tiles

struct PathProfileCard: View {
    let session: Session
    let course: Course
    @State private var model: PathModel?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Group {
            switch model?.phase ?? .loading {
            case .loading, .failed:
                EmptyView()
            case .none:
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                    Text("My path").dsText(.headline).foregroundStyle(ds.ink)
                    Text("Build a daily plan from your goal: lessons, podcasts, talks and story campaigns. Open the Learn tab to start.")
                        .dsText(.footnote).foregroundStyle(ds.inkSoft)
                }
                .padding(AlphonsoDS.Space.s3)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card))
            case .ready(let path):
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                        Text("MY PATH").dsText(.overline).foregroundStyle(ds.onHeroKick)
                        Text("Finish \(path.goalLabel)").dsText(.headline).foregroundStyle(ds.onHero)
                        Text(path.statusLine).dsText(.footnote).foregroundStyle(ds.xp)
                        PathBar(fraction: path.weekFraction)
                        Text("This week: \(path.weekDoneMinutes) of \(path.weekMinutes) min")
                            .dsText(.caption).foregroundStyle(ds.onHeroSoft)
                    }
                    .padding(AlphonsoDS.Space.s3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.hero))
                    .accessibilityElement(children: .combine)
                    HStack(spacing: AlphonsoDS.Space.s2) {
                        ForEach(Array(path.streaks.enumerated()), id: \.offset) { _, streak in
                            VStack(spacing: AlphonsoDS.Space.s1) {
                                PathTypeBadge(kind: streak.kind, small: true)
                                Text("\(streak.days)d").dsText(.headline).foregroundStyle(ds.ink)
                                Text("\(streak.weekMinutes) min").dsText(.caption).foregroundStyle(ds.inkSoft)
                                Text(streak.kind.label).dsText(.caption).foregroundStyle(ds.inkSoft)
                            }
                            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.s12 * 2)
                            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(
                                "\(streak.kind.label): \(streak.days) \(streak.days == 1 ? "day" : "days") in a row, \(streak.weekMinutes) minutes this week")
                        }
                    }
                    Text("Days in a row and minutes this week, per activity.")
                        .dsText(.caption).foregroundStyle(ds.inkSoft)
                }
            }
        }
        .task(id: course.translationCourseCode) {
            let made = PathModel(session: session, courseCode: course.translationCourseCode)
            model = made
            await made.load()
        }
    }
}
