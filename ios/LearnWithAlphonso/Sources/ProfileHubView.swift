import SwiftUI
import LearnWithAlphonsoKit

/// Profile: the hub for everything that left the tab bar in Phase 0 of the
/// podcast work (docs/archive/2026-09/2026-09-24-podcast-phase0-ios-tabs-design.md).
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
        case league, friends, invite, achievements, settings, review, paywall, picture, memory
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
            // The scene first, the flat surface behind it: a `.background` added later sits BEHIND an earlier one, so
            // the surface used to be drawn over the scene (plain navy on builds 61 to 63).
            .screenScene(.profile)
            .background(ds.surface)
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
            case .invite:
                ReferralInviteView(session: session)
            case .achievements:
                AchievementsView(
                    session: session,
                    contentStore: contentStore,
                    notificationScheduler: notificationScheduler
                )
            case .settings:
                SettingsView(session: session, entitlementStore: entitlementStore, syncQueueStore: syncQueueStore)
            case .review:
                ReviewQueueView(contentStore: contentStore, session: session, notificationScheduler: notificationScheduler,
                                networkMonitor: networkMonitor, syncQueueStore: syncQueueStore)
            case .paywall:
                PaywallView(entitlementStore: entitlementStore, source: .hectorTab, onClose: { destination = nil })
            case .memory:
                NavigationStack {
                    TutorMemoryView(
                        session: session, course: activeCourse.course,
                        onUpgrade: { destination = .paywall })
                }
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
        icon: AlphonsoDS.Icon,
        tint: Color,
        ink: Color
    ) -> some View {
        ProfileRowCard(icon: icon, tint: tint, ink: ink, title: title, subtitle: subtitle) {
            destination = target
        }
        // The cards carry their own shape; List separators between them read as stray lines.
        .listRowSeparator(.hidden)
    }
}

extension ProfileHubView {
    @ViewBuilder fileprivate var overviewRows: some View {
        if let m = overview {
            let course = activeCourse.course
            Group {
                ProfileHeroSection(model: m, course: course, compact: tab != .overview, onPicture: { destination = .picture })
                    .sceneScrollProbe()
                if tab == .overview {
                    ProfileCoursePicker(course: course, onCourse: { activeCourse.course = $0 })
                }
                if !m.hasAnyActivity {
                    Text("Your first lesson starts your streak and fills in this page.")
                        .dsText(.body)
                        .padding(.horizontal, AlphonsoDS.Space.s2)
                }
                ProfileTabPicker(selection: $tab)
                switch tab {
                case .overview:
                    ProfileWeekSection(model: m)
                    ProfileAchievementsPreview(model: m, catalogCount: contentStore.achievements.count, action: { destination = .achievements })
                    // Only when there is a card to show: an empty section still takes a list row and leaves a gap.
                    if m.hector != nil {
                        ProfileWeakAndHectorSection(model: m, showWeak: false, showHector: true, onPractice: { destination = .review }, onPaywall: { destination = .paywall })
                    }
                    ProfileMemoryCard(session: session, action: { destination = .memory })
                    ProfileRowCard(icon: .target, tint: ds.choiceTint, ink: ds.choice, title: "Edit your answers",
                                   subtitle: "Goal, level, daily time, interests", action: onEditAnswers)
                    row(.settings, title: "Settings", subtitle: "Theme and account", icon: .settings, tint: ds.rightTint, ink: ds.right)
                case .progress:
                    ProfileSkillsSection(model: m)
                    PathProfileCard(session: session, course: activeCourse.course)
                        .id(activeCourse.course.translationCourseCode)
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
                case .social:
                    ProfileLeagueCard(model: m)
                    row(.league, title: "League", subtitle: "Leaderboards, teams, and the season ladder", icon: .league, tint: ds.xpTint, ink: ds.xpText)
                    row(.friends, title: "Friends", subtitle: "Your friends, their activity, and duels", icon: .friends, tint: ds.choiceTint, ink: ds.choice)
                    row(.invite, title: "Invite friends", subtitle: "You both get a reward when they finish a first lesson", icon: .gift, tint: ds.rightTint, ink: ds.right)
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

    /// The row that opens a full screen and has no card on its tab: Achievements, on Progress. Overview and Social
    /// keep their rows (Edit your answers, Settings; League, Friends, Invite) inside the tab's own content.
    @ViewBuilder fileprivate var tabNavRows: some View {
        if tab == .progress {
            Section {
                row(.achievements, title: "Achievements", subtitle: overview.map { ProfileTabs.achievementsSummary(unlocked: $0.unlockedCount, total: contentStore.achievements.count) } ?? "Badges you have earned", icon: .star, tint: ds.xpTint, ink: ds.xpText)
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
        let dailyMinutes = (try? await learnerProfileClient(session)?.fetch())?.answers.dailyMinutes
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
