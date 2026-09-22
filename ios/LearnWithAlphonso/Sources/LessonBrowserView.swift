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
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            List {
                StatusHeaderView(progress: syncQueueStore.lastKnownProgress())
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)

                WeeklyChallengesSection(session: session)

                ForEach(contentStore.bundle(for: course).units) { unit in
                    Section {
                        ForEach(Array(unit.lessons.enumerated()), id: \.element.id) { index, lesson in
                            NavigationLink(value: lesson.id) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(lesson.title)
                                        .font(AlphonsoFont.sans(16, weight: .medium))
                                        .foregroundStyle(AlphonsoColor.ink)
                                    Text(lesson.subtitle)
                                        .font(AlphonsoFont.sans(13))
                                        .foregroundStyle(AlphonsoColor.inkSoft)
                                }
                                .padding(.vertical, 2)
                            }
                            // Lazy List rows already fire onAppear as they
                            // scroll into view, so this cascades naturally
                            // rather than animating the whole (possibly
                            // 100+ row) list at once -- a small index-based
                            // delay just makes the *first* screenful cascade
                            // in visibly instead of popping in together.
                            .springEntrance(delay: Double(index % 8) * 0.04)
                        }
                    } header: {
                        Text("\(unit.eyebrow) · \(unit.title)")
                            .font(AlphonsoFont.sans(12, weight: .semiBold))
                            .tracking(0.4)
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                    .listRowBackground(AlphonsoColor.parchment)
                }
            }
            .scrollContentBackground(.hidden)
            .background(AlphonsoColor.surface)
            .navigationTitle("Learn with Alphonso")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    CoursePicker(course: $course)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape.fill")
                    }
                    .tint(AlphonsoColor.moss)
                }
            }
            .navigationDestination(for: String.self) { lessonId in
                if let found = contentStore.findLesson(id: lessonId, course: course) {
                    LessonPlayerView(lesson: found.lesson, course: course, session: session, notificationScheduler: notificationScheduler, contentStore: contentStore, networkMonitor: networkMonitor, syncQueueStore: syncQueueStore)
                } else {
                    Text("Lesson not found")
                }
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView(session: session)
            }
        }
        .tint(AlphonsoColor.moss)
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
