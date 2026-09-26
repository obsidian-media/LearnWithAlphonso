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
    @State private var showingReview = false

    /// Due reviews from the offline cache -- no network call, same posture
    /// as StatusHeaderView above. See ReviewBadge's doc comment for why a
    /// stale cache under-reports rather than over-reports.
    private var dueReviewCount: Int {
        syncQueueStore.lastKnownDueReviews().count
    }

    private var reviewSubtitle: String {
        switch dueReviewCount {
        case 0: return "Nothing due right now"
        case 1: return "1 item ready to review"
        default: return "\(dueReviewCount) items ready to review"
        }
    }

    var body: some View {
        NavigationStack {
            List {
                StatusHeaderView(progress: syncQueueStore.lastKnownProgress())
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)

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

                WeeklyChallengesSection(session: session)

                // Fallback for anyone RootView's post-sign-in placement
                // gate didn't reach (skipped it, or it fires for the
                // account's default course only) -- mirrors learn.tsx's
                // own persistent "Take the placement test" banner
                // exactly. See PlacementView.swift's doc comment.
                PlacementBannerSection(contentStore: contentStore, session: session, course: course)

                ForEach(contentStore.bundle(for: course).units) { unit in
                    let lessonRows = ForEach(Array(unit.lessons.enumerated()), id: \.element.id) { index, lesson in
                        NavigationLink(value: lesson.id) {
                            AlphonsoRowCard(
                                title: lesson.title,
                                subtitle: lesson.subtitle,
                                accent: index == 0 ? AlphonsoColor.ember : AlphonsoColor.moss
                            )
                        }
                        // Lazy List rows already fire onAppear as they
                        // scroll into view, so this cascades naturally
                        // rather than animating the whole (possibly
                        // 100+ row) list at once -- a small index-based
                        // delay just makes the *first* screenful cascade
                        // in visibly instead of popping in together.
                        .springEntrance(delay: Double(index % 8) * 0.04)
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
            .sheet(isPresented: $showingReview) {
                ReviewQueueView(
                    contentStore: contentStore,
                    session: session,
                    notificationScheduler: notificationScheduler,
                    networkMonitor: networkMonitor,
                    syncQueueStore: syncQueueStore
                )
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

private extension Course {
    var code: String {
        switch self {
        case .english: return "en"
        case .french: return "fr"
        case .spanish: return "es"
        }
    }
}
