import SwiftUI
import LearnWithAlphonsoKit

/// Learn's path cards, between the map and the For you rail: "Your path is ready" while the goal is only a suggestion,
/// "Today" with the normal plan, and "Fix before it sticks" with the weak-spot items. Every word comes from the
/// server's path (the same text web and Android print); this view only lays it out with the existing rows and tokens.
struct LearnPathCards: View {
    let model: PathModel
    let session: Session
    let course: Course
    let onBuild: () -> Void
    /// Opens a lesson (the path's own, or a refresher).
    let onOpenLesson: (String) -> Void
    /// Opens the Review queue ("Fix your weak spots").
    let onOpenReview: () -> Void

    @State private var saving = false
    @State private var saveFailed = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        if let path = model.path {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                if path.goalIsSuggested { ready(path) }
                if !path.today.items.isEmpty { today(path) }
                if let fix = path.fix, !fix.items.isEmpty { fixCard(fix) }
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.vertical, AlphonsoDS.Space.s2)
        }
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2, content: content)
            .padding(AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card.opacity(0.94)))
            .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
    }

    private func ready(_ path: LearningPath) -> some View {
        card {
            Text("Your path is ready").dsText(.overline).foregroundStyle(ds.rightInk)
            Text(path.goalLabel).dsText(.title).foregroundStyle(ds.ink)
            if let built = path.goal?.built {
                Text(built).dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
            HStack(spacing: AlphonsoDS.Space.s2) {
                Button("Looks good") { Task { await accept(path) } }
                    .buttonStyle(.alphonsoPrimary).disabled(saving)
                Button("Change target") { onBuild() }
                    .buttonStyle(.alphonsoSecondary)
            }
            if saveFailed {
                Text("Couldn't save that. Try again.").dsText(.footnote).foregroundStyle(ds.wrongInk)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func today(_ path: LearningPath) -> some View {
        let done = path.today.items.filter { $0.state == "done" }.count
        return card {
            HStack {
                Text("Today").dsText(.headline).foregroundStyle(ds.ink)
                Spacer()
                Text("\(done) of \(path.today.items.count) \u{00B7} \(path.today.targetMinutes) min")
                    .dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            ForEach(Array(path.today.items.enumerated()), id: \.offset) { _, item in
                row(item)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func fixCard(_ fix: PathFixCard) -> some View {
        card {
            Text(fix.overline).dsText(.overline).foregroundStyle(ds.heartText)
            Text(fix.title).dsText(.headline).foregroundStyle(ds.ink)
            ForEach(Array(fix.items.enumerated()), id: \.offset) { _, item in
                row(item)
            }
            if let first = fix.items.first {
                Button("Fix them now") { open(first) }
                    .buttonStyle(.alphonsoPrimary)
            }
        }
        .accessibilityElement(children: .contain)
    }

    /// The path's own row (icon, title, subtitle, minutes); a tap opens what it points at.
    private func row(_ item: PathItem) -> some View {
        Button { open(item) } label: { PathItemRow(item: item) }
            .buttonStyle(.plain)
            .disabled(item.state == "done" || item.ref == nil)
    }

    private func open(_ item: PathItem) {
        switch PathStopRouting.destination(for: item.ref, done: item.state == "done") {
        case .lesson(let id)?: onOpenLesson(id)
        case .review?: onOpenReview()
        default: break
        }
    }

    private func accept(_ path: LearningPath) async {
        saving = true
        saveFailed = false
        defer { saving = false }
        guard let token = await session.freshAccessToken() else { saveFailed = true; return }
        let goals = LearningGoalClient(
            baseURL: AppConfig.apiBaseURL, accessToken: { token },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
        do {
            _ = try await goals.save(
                course: course.translationCourseCode, targetLevel: path.progress.targetLevel,
                targetDate: path.progress.targetDate)
            await model.load()
        } catch {
            saveFailed = true
        }
    }
}
