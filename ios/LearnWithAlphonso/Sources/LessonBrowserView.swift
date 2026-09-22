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

    @State private var course: Course = .english

    var body: some View {
        NavigationStack {
            List {
                WeeklyChallengesSection(session: session)

                ForEach(contentStore.bundle(for: course).units) { unit in
                    Section {
                        ForEach(unit.lessons) { lesson in
                            NavigationLink(value: lesson.id) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(lesson.title)
                                        .font(.body)
                                    Text(lesson.subtitle)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    } header: {
                        Text("\(unit.eyebrow) · \(unit.title)")
                    }
                }
            }
            .navigationTitle("Learn with Alphonso")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Picker("Course", selection: $course) {
                        Text("English").tag(Course.english)
                        Text("Français").tag(Course.french)
                        Text("Español").tag(Course.spanish)
                    }
                    .pickerStyle(.segmented)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign out") { session.signOut() }
                }
            }
            .navigationDestination(for: String.self) { lessonId in
                if let found = contentStore.findLesson(id: lessonId, course: course) {
                    LessonPlayerView(lesson: found.lesson, course: course, session: session, notificationScheduler: notificationScheduler, contentStore: contentStore, networkMonitor: networkMonitor, syncQueueStore: syncQueueStore)
                } else {
                    Text("Lesson not found")
                }
            }
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
                Section("This week's challenges") {
                    ForEach(challenges) { c in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.title)
                                .strikethrough(c.completed)
                                .foregroundStyle(c.completed ? .secondary : .primary)
                            ProgressView(value: Double(min(c.progress, c.threshold)), total: Double(c.threshold))
                            Text("\(min(c.progress, c.threshold))/\(c.threshold)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
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
