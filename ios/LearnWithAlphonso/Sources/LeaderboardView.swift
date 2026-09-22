import SwiftUI
import LearnWithAlphonsoKit

/// Port of the web app's `/league` screen (src/routes/_authenticated/
/// league.tsx): global/friends/country x weekly/all-time leaderboards via
/// the existing `get_leaderboard` RPC -- no Edge Function, no new backend
/// code. XP is account-wide (language_progress/user_progress), not
/// per-course, so this view is Course-independent, matching the RPC's own
/// join. The RPC has no `isYou` flag; this view computes it the same way
/// the web app does, by comparing each row's userID to Session.userID.
struct LeaderboardView: View {
    let session: Session

    private enum Scope: String, CaseIterable { case global, friends, country }
    private enum Period: String, CaseIterable { case weekly, allTime = "all-time" }

    @State private var scope: Scope = .global
    @State private var period: Period = .weekly
    @State private var rows: [LeaderboardRow] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var overtakeToastMessage: String?
    @State private var showingWeeklyRecap = false

    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                VStack(spacing: 8) {
                    Picker("Scope", selection: $scope) {
                        Text("Global").tag(Scope.global)
                        Text("Friends").tag(Scope.friends)
                        Text("Country").tag(Scope.country)
                    }
                    .pickerStyle(.segmented)
                    Picker("Period", selection: $period) {
                        Text("Weekly").tag(Period.weekly)
                        Text("All-time").tag(Period.allTime)
                    }
                    .pickerStyle(.segmented)

                    Group {
                        if isLoading {
                            ProgressView().frame(maxHeight: .infinity)
                        } else if let errorMessage {
                            ContentUnavailableView("Couldn't load the leaderboard", systemImage: "wifi.slash", description: Text(errorMessage))
                        } else if rows.isEmpty {
                            ContentUnavailableView(emptyStateTitle, systemImage: "trophy", description: Text(emptyStateDescription))
                        } else {
                            List {
                                ForEach(Array(rows.enumerated()), id: \.element.userID) { index, row in
                                    LeaderboardRowView(rank: index + 1, row: row, isYou: row.userID == session.userID)
                                }
                            }
                            .listStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.top, 8)

                if let overtakeToastMessage {
                    ToastBanner(message: overtakeToastMessage, iconName: "arrow.up.arrow.down.circle.fill")
                        .padding(.top, 4)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .navigationTitle("League")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink("Teams") {
                        TeamsView(session: session)
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink("Season") {
                        SeasonView(session: session)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Recap", systemImage: "calendar") { showingWeeklyRecap = true }
                }
            }
            .sheet(isPresented: $showingWeeklyRecap) {
                WeeklyRecapView(session: session)
            }
        }
        .task(id: "\(scope.rawValue)-\(period.rawValue)") { await load() }
        .task { await checkForOvertake() }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                Task { await checkForOvertake() }
            }
        }
    }

    private var emptyStateTitle: String {
        switch scope {
        case .friends: return "Add friends to compete"
        case .country: return "Set your country"
        case .global: return "Nothing here yet"
        }
    }

    private var emptyStateDescription: String {
        switch scope {
        case .friends: return "Add friends to compete side by side."
        case .country: return "Set your country on your profile to see this board."
        case .global: return "Finish a lesson to appear on the board."
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        guard let accessToken = session.accessToken else {
            errorMessage = "You've been signed out. Please sign in again."
            isLoading = false
            return
        }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            rows = try await client.fetchLeaderboard(scope: scope.rawValue, period: period.rawValue)
        } catch {
            errorMessage = "Check your connection and try again."
        }
        isLoading = false
    }

    /// Approximates "you've been overtaken" (docs/v2-kickoffs/
    /// 03-leaderboards.md's "Deepened feature 1", Option A) -- **not** a
    /// true push. This only ever runs while foregrounded, diffing against
    /// a locally-cached snapshot from the last time it ran; someone
    /// overtaking the user while the app is closed is structurally
    /// invisible to this approach. An in-app toast rather than a real
    /// local notification, since a notification's main value (reaching
    /// someone when the app *isn't* open) doesn't apply here -- see the
    /// doc's own note flagging this as a real judgment call, not an
    /// oversight.
    private func checkForOvertake() async {
        guard let accessToken = session.accessToken, let userID = session.userID else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        guard let liveRows = try? await client.fetchLeaderboard(scope: "global", period: "weekly") else { return }
        let current = liveRows.map { LeaderboardSnapshotEntry(userID: $0.userID, xp: $0.xp) }

        if let previous = LeaderboardSnapshotCache.lastSnapshot, wasOvertaken(previous: previous, current: current, me: userID) {
            showToast("Someone passed you on the leaderboard!", into: $overtakeToastMessage)
        }
        LeaderboardSnapshotCache.lastSnapshot = current
    }
}

private struct LeaderboardRowView: View {
    let rank: Int
    let row: LeaderboardRow
    let isYou: Bool

    var body: some View {
        HStack(spacing: 12) {
            Text("\(rank)")
                .font(.caption.weight(.semibold))
                .frame(width: 28, height: 28)
                .background(rankBadgeColor)
                .clipShape(Circle())

            Circle()
                .fill(avatarColor)
                .frame(width: 36, height: 36)
                .overlay(
                    Text(row.displayName.prefix(1).uppercased())
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(row.displayName).font(.subheadline.weight(.medium))
                    if isYou {
                        Text("YOU")
                            .font(.system(size: 9, weight: .semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.accentColor)
                            .foregroundStyle(.white)
                            .clipShape(Capsule())
                    }
                }
                if let country = row.country {
                    Text(country.uppercased())
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            Text("\(row.xp) XP")
                .font(.subheadline.weight(.semibold))
        }
        .listRowBackground(isYou ? Color.accentColor.opacity(0.1) : nil)
    }

    /// Matches the web app's rank-medal coloring for the top 3 rows
    /// (league.tsx): gold/silver/bronze, falling back to a neutral tint.
    private var rankBadgeColor: Color {
        switch rank {
        case 1: return .yellow.opacity(0.6)
        case 2: return Color(.systemGray4)
        case 3: return .orange.opacity(0.6)
        default: return Color(.secondarySystemBackground)
        }
    }

    /// Ports the web app's `hsl(seed.charCodeAt(0)*37 % 360, 40%, 45%)`
    /// avatar color derivation exactly (league.tsx), so a given avatar_seed
    /// produces the same color on both platforms. `Color(hue:saturation:
    /// brightness:)` is HSB, not HSL -- a different color model that would
    /// render visibly different colors here -- so this converts HSL to RGB
    /// directly instead.
    private var avatarColor: Color {
        let firstCharCode = row.avatarSeed.unicodeScalars.first.map { Int($0.value) } ?? 0
        let hue = Double((firstCharCode * 37) % 360) / 360.0
        let (r, g, b) = Self.hslToRGB(hue: hue, saturation: 0.40, lightness: 0.45)
        return Color(red: r, green: g, blue: b)
    }

    private static func hslToRGB(hue: Double, saturation: Double, lightness: Double) -> (Double, Double, Double) {
        guard saturation > 0 else { return (lightness, lightness, lightness) }
        let q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
        let p = 2 * lightness - q
        func component(_ t: Double) -> Double {
            var t = t
            if t < 0 { t += 1 }
            if t > 1 { t -= 1 }
            if t < 1.0 / 6 { return p + (q - p) * 6 * t }
            if t < 1.0 / 2 { return q }
            if t < 2.0 / 3 { return p + (q - p) * (2.0 / 3 - t) * 6 }
            return p
        }
        return (component(hue + 1.0 / 3), component(hue), component(hue - 1.0 / 3))
    }
}

/// Shown from the "Recap" toolbar button (and intended for a scheduled
/// weekly-recap notification tap too -- see NotificationScheduler.
/// scheduleWeeklyRecap -- though this app has no notification-tap
/// routing/delegate infrastructure yet, so that specific entry point
/// isn't wired up in this slice; the button is the real, working way in
/// for now). Last week's XP total is exact (queried directly from
/// activity_days); rank and league movement are both approximations the
/// design doc explicitly accepts for V2 rather than building a new
/// historical-snapshot RPC -- see docs/v2-kickoffs/03-leaderboards.md's
/// "Deepened feature 2".
private struct WeeklyRecapView: View {
    let session: Session

    @Environment(\.dismiss) private var dismiss
    @State private var isLoading = true
    @State private var lastWeekXP: Int?
    @State private var currentRank: Int?
    @State private var promotedToTier: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else {
                    ScrollView {
                        VStack(spacing: 20) {
                            VStack(spacing: 4) {
                                Text("Last week you earned")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                Text("\(lastWeekXP ?? 0) XP")
                                    .font(.system(size: 40, weight: .bold))
                            }

                            if let currentRank {
                                VStack(spacing: 6) {
                                    VStack(spacing: 2) {
                                        Text("Your rank today (global, weekly)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        Text("#\(currentRank)")
                                            .font(.title2.weight(.semibold))
                                    }
                                    Text("Approximate -- this app doesn't keep a historical snapshot of last week's exact standings.")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                        .multilineTextAlignment(.center)
                                        .padding(.horizontal)
                                }
                            }

                            if let promotedToTier {
                                VStack(spacing: 4) {
                                    Image(systemName: "arrow.up.circle.fill")
                                        .font(.title)
                                        .foregroundStyle(LeagueTierPalette.color(for: promotedToTier))
                                    Text("You moved up to \(LeagueTierPalette.label(for: promotedToTier))!")
                                        .font(.subheadline.weight(.semibold))
                                }
                            }
                        }
                        .padding()
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .navigationTitle("Weekly recap")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        guard let accessToken = session.accessToken, let userID = session.userID else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)

        let thisMonday = mondayDateString(weeksAgo: 0)
        let lastMonday = mondayDateString(weeksAgo: 1)
        lastWeekXP = try? await client.fetchActivityXP(userID: userID, from: lastMonday, to: thisMonday)

        if let liveRows = try? await client.fetchLeaderboard(scope: "global", period: "weekly") {
            currentRank = liveRows.firstIndex { $0.userID == userID }.map { $0 + 1 }
        }

        let currentTier = LeagueTierCache.lastKnownTier
        let previousTier = WeeklyRecapCache.lastRecapLeagueTier
        if let currentTier, let previousTier, isLeaguePromotion(from: previousTier, to: currentTier) {
            promotedToTier = currentTier
        }
        WeeklyRecapCache.lastRecapLeagueTier = currentTier
    }

    private func isLeaguePromotion(from: String, to: String) -> Bool {
        let order = ["bronze", "silver", "sapphire", "ruby", "diamond"]
        guard let fromIdx = order.firstIndex(of: from), let toIdx = order.firstIndex(of: to) else { return false }
        return toIdx > fromIdx
    }
}

/// UTC "yyyy-MM-dd" for the Monday `weeksAgo` weeks back (0 = this week's
/// Monday) -- matches `get_leaderboard`'s own ISO-week `wk` computation
/// (`current_date - (isodow - 1)`), so "this week" here means the same
/// week that RPC considers current.
private func mondayDateString(weeksAgo: Int, now: Date = Date()) -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    let weekday = calendar.component(.weekday, from: now) // Sunday=1...Saturday=7
    let daysSinceMonday = (weekday + 5) % 7
    let monday = calendar.date(byAdding: .day, value: -daysSinceMonday - (weeksAgo * 7), to: now) ?? now
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = TimeZone(identifier: "UTC")
    formatter.locale = Locale(identifier: "en_US_POSIX")
    return formatter.string(from: monday)
}
