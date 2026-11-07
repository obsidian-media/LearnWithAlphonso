import SwiftUI
import LearnWithAlphonsoKit

/// Profile: the hub for everything that left the tab bar in Phase 0 of the
/// podcast work (docs/superpowers/specs/2026-09-24-podcast-phase0-ios-tabs-design.md).
///
/// Seven tabs were declared and iPhone renders five, so Achievements was
/// already collapsed into the system "More" list before Listen needed a
/// slot. League, Friends and Achievements move here.
///
/// Destinations are presented modally rather than pushed. Each of those
/// three screens owns its own `NavigationStack` -- LeaderboardView and
/// FriendsView additionally push Teams/Season/Duels through it -- so
/// pushing them inside this view's stack would nest navigation stacks and
/// give two navigation bars and unreliable inner links. That compiles
/// cleanly and is wrong on a screen, which is the failure mode this repo
/// has already paid for three times. Presenting them keeps those three
/// working screens untouched, and matches how LessonBrowserView already
/// presents SettingsView from its gear.
struct ProfileHubView: View {
    @Environment(\.alphonsoDS) private var ds
    let session: Session
    let contentStore: ContentStore
    let notificationScheduler: NotificationScheduler
    let entitlementStore: EntitlementStore
    let activeCourse: ActiveCourseModel
    let networkMonitor: NetworkMonitor
    let syncQueueStore: SyncQueueStore
    /// Opens the first-run questions again ("Edit your answers"; RootView's cover).
    var onEditAnswers: () -> Void = {}

    private enum Destination: String, Identifiable {
        case league, friends, achievements, settings, review, paywall, picture
        var id: String { rawValue }
    }

    @State private var destination: Destination?
    @State private var overview: ProfileOverviewModel?
    @State private var loadFailed = false
    @State private var loading = true
    @State private var tab: ProfileTab = .overview

    var body: some View {
        NavigationStack {
            List {
                overviewRows
                tabNavRows
            }
            .scrollContentBackground(.hidden)
            .background(ds.surface)
            .screenScene(.profile)
            .navigationTitle("Profile")
            .task(id: activeCourse.course.wireCode) { await load() }
            .refreshable { await load() }
        }
        .tint(ds.choice)
        .sheet(item: $destination) { target in
            switch target {
            case .league:
                LeaderboardView(session: session)
            case .friends:
                FriendsView(session: session)
            case .achievements:
                AchievementsView(
                    session: session,
                    contentStore: contentStore,
                    notificationScheduler: notificationScheduler
                )
            case .settings:
                SettingsView(session: session)
            case .review:
                ReviewQueueView(contentStore: contentStore, session: session, notificationScheduler: notificationScheduler,
                                networkMonitor: networkMonitor, syncQueueStore: syncQueueStore)
            case .paywall:
                PaywallView(entitlementStore: entitlementStore, source: .hectorTab, onClose: { destination = nil })
            case .picture:
                AvatarPickerSheet(session: session, name: overview?.name ?? "", current: overview?.data.avatarSeed ?? "") { _ in
                    Task { await load() }
                }
            }
        }
    }

    private func row(
        _ target: Destination,
        title: String,
        subtitle: String,
        emoji: String,
        tone: AlphonsoTileTone
    ) -> some View {
        Button {
            destination = target
        } label: {
            AlphonsoTile(tone: tone, emoji: emoji, title: title, subtitle: subtitle, glass: true)
        }
        .buttonStyle(.plain)
        // The tiles carry their own shape; List separators between them read as stray lines.
        .listRowSeparator(.hidden)
    }
}

extension ProfileHubView {
    @ViewBuilder fileprivate var overviewRows: some View {
        if let m = overview {
            let course = activeCourse.course
            Group {
                ProfileHeroSection(model: m, course: course, onCourse: { activeCourse.course = $0 }, onPicture: { destination = .picture })
                    .sceneScrollProbe()
                if !m.hasAnyActivity {
                    Text("Your first lesson starts your streak and fills in this page.")
                        .dsText(.body)
                        .padding(.horizontal, AlphonsoDS.Space.s2)
                }
                ProfileTabPicker(selection: $tab)
                switch tab {
                case .overview:
                    ProfileWeekSection(model: m)
                    ProfileWeakAndHectorSection(model: m, showWeak: false, showHector: true, onPractice: { destination = .review }, onPaywall: { destination = .paywall })
                case .progress:
                    ProfileSkillsSection(model: m)
                    ProfileFold(title: "Activity", summary: ProfileTabs.heatSummary(activeDays: m.heat.activeDays)) {
                        ProfileHeatMapSection(model: m)
                    }
                    ProfileFold(
                        title: "Records and level",
                        summary: "\(ProfileTabs.recordsSummary(bestStreak: m.records.bestStreak)) · \(m.level.level) · \(m.level.pct)%"
                    ) {
                        ProfileRecordsLevelSection(model: m)
                    }
                    ProfileFold(title: "Weak spots", summary: ProfileTabs.weakSummary(total: m.weak.total)) {
                        ProfileWeakAndHectorSection(model: m, showWeak: true, showHector: false, onPractice: { destination = .review }, onPaywall: { destination = .paywall })
                    }
                    ProfileFold(
                        title: "Achievements",
                        summary: ProfileTabs.achievementsSummary(unlocked: m.unlockedCount, total: contentStore.achievements.count)
                    ) {
                        ProfileProgressSection(model: m, catalogCount: contentStore.achievements.count, showAchievements: true, showSocial: false)
                    }
                case .social:
                    ProfileProgressSection(model: m, catalogCount: contentStore.achievements.count, showAchievements: false, showSocial: true)
                    ProfileShareSection(model: m, course: course, level: m.level.level)
                }
            }
            .listRowInsets(EdgeInsets(top: AlphonsoDS.Space.s2, leading: AlphonsoDS.Space.s4, bottom: AlphonsoDS.Space.s2, trailing: AlphonsoDS.Space.s4))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
        } else if loading {
            ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
        } else if loadFailed {
            VStack(spacing: AlphonsoDS.Space.s2) {
                Text("Profile could not load.").dsText(.headline)
                Button("Try again") { Task { await load() } }.frame(minHeight: AlphonsoDS.Space.minTouch)
            }
            .frame(maxWidth: .infinity).listRowBackground(Color.clear)
        }
    }

    /// The rows that open full screens, kept on the tab where each belongs: settings and "Edit your answers" on
    /// Overview, Achievements on Progress, League and Friends on Social.
    @ViewBuilder fileprivate var tabNavRows: some View {
        switch tab {
        case .overview:
            ProfileEditAnswersRow(onEditAnswers: onEditAnswers)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            Section {
                row(.settings, title: "Settings", subtitle: "Theme and account", emoji: "⚙️", tone: .mint)
            }
            .listRowBackground(Color.clear)
        case .progress:
            Section {
                row(.achievements, title: "Achievements", subtitle: "Badges earned and weak spots to work on", emoji: "⭐️", tone: .lilac)
            }
            .listRowBackground(Color.clear)
        case .social:
            Section {
                row(.league, title: "League", subtitle: "Leaderboards, teams, and the season ladder", emoji: "🏆", tone: .sun)
                row(.friends, title: "Friends", subtitle: "Your friends, their activity, and duels", emoji: "👥", tone: .sky)
            }
            .listRowBackground(Color.clear)
        }
    }

    fileprivate func load() async {
        loading = true
        defer { loading = false }
        guard let token = await session.freshAccessToken(), let userID = session.userID else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
        let course = activeCourse.course
        // The learner's chosen daily time (first run), if any; a failed read just means no goal.
        let dailyMinutes = (try? await learnerProfileClient(session)?.fetch())?.dailyMinutes
        do {
            let data = try await client.fetchProfileOverview(userID: userID, course: course.wireCode)
            overview = ProfileOverviewModel(data: data, contentStore: contentStore, course: course, isPro: entitlementStore.isPro, dailyGoalMinutes: dailyMinutes)
            loadFailed = false
        } catch is CancellationError {
        } catch {
            loadFailed = overview == nil
        }
    }
}
