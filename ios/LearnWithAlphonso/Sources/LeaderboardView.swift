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
    @State private var blockTarget: SocialTarget?
    @State private var reportTarget: SocialTarget?

    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @Environment(\.alphonsoDS) private var ds

    private var scopeOptions: [DSSegmented<Scope>.Option] {
        [.init(value: .global, label: "Global"), .init(value: .friends, label: "Friends"), .init(value: .country, label: "Country")]
    }

    private var periodOptions: [DSSegmented<Period>.Option] {
        [.init(value: .weekly, label: "Weekly"), .init(value: .allTime, label: "All-time")]
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                // The loader below sits on this always-present stack; the List itself always draws its hero.
                List {
                    heroCard
                        .dsListRow(top: AlphonsoDS.Space.s2)

                    DSSegmented(options: scopeOptions, selection: $scope, accessibilityLabel: "Leaderboard scope")
                        .accessibilityIdentifier("leagueScopePicker")
                        .dsListRow(bottom: AlphonsoDS.Space.s2)
                    DSSegmented(options: periodOptions, selection: $period, accessibilityLabel: "Leaderboard period")
                        .accessibilityIdentifier("leagueRangePicker")
                        .dsListRow()

                    if isLoading {
                        DSCard { ProgressView().tint(ds.choice).frame(maxWidth: .infinity) }
                            .dsListRow()
                    } else if let errorMessage {
                        DSEmptyState(art: "Alphonso-thinking", title: "Couldn't load the leaderboard", message: errorMessage)
                            .dsListRow()
                    } else if rows.isEmpty {
                        DSEmptyState(art: "Alphonso-waving", title: emptyStateTitle, message: emptyStateDescription)
                            .dsListRow()
                    } else {
                        DSCard(padding: AlphonsoDS.Space.s2, spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.userID) { index, row in
                                let isYou = row.userID == session.userID
                                LeaderboardRowView(rank: index + 1, row: row, isYou: isYou) {
                                    blockTarget = SocialTarget(id: row.userID, displayName: row.displayName)
                                } onReport: {
                                    reportTarget = SocialTarget(id: row.userID, displayName: row.displayName)
                                }
                                .springEntrance(delay: Double(index % 8) * 0.04)
                            }
                        }
                        .dsListRow()
                    }
                }
                .dsSceneList(.profile)

                if let overtakeToastMessage {
                    ToastBanner(message: overtakeToastMessage, iconName: "arrow.up.arrow.down.circle.fill")
                        .padding(.top, AlphonsoDS.Space.s1)
                        .transition(ToastBanner.transition(reduceMotion: reduceMotion))
                }
            }
            .navigationTitle("League")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink("Teams") {
                        TeamsView(session: session)
                    }
                    .accessibilityLabel("Teams")
                    .accessibilityHint("Opens your team and the team leaderboard")
                }
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink("Season") {
                        SeasonView(session: session)
                    }
                    .accessibilityLabel("Season")
                    .accessibilityHint("Opens this season's division")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Recap", systemImage: "calendar") { showingWeeklyRecap = true }
                }
            }
            .sheet(isPresented: $showingWeeklyRecap) {
                WeeklyRecapView(session: session)
            }
        }
        .tint(ds.choice)
        .task(id: "\(scope.rawValue)-\(period.rawValue)") { await load() }
        .task { await checkForOvertake() }
        // A block made on a screen pushed above this one (Teams) must not wait for a reload to take effect.
        .onReceive(NotificationCenter.default.publisher(for: BlockedUserSignal.name)) { note in
            if let blocked = BlockedUserSignal.userID(from: note) {
                rows.removeAll { $0.userID == blocked }
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                Task { await checkForOvertake() }
            }
        }
        .alphonsoChoiceDialog(
            "Block \(blockTarget?.displayName ?? "this user")?",
            isPresented: Binding(
                get: { blockTarget != nil },
                set: { if !$0 { blockTarget = nil } },
            ),
        ) {
            Button("Block", role: .destructive) {
                if let target = blockTarget {
                    Task { await block(target) }
                }
                blockTarget = nil
            }
            Button("Cancel", role: .cancel) { blockTarget = nil }
        } message: {
            Text(SocialSafetyCopy.blockConfirmationMessage(blockTarget?.displayName ?? "This person"))
        }
        .sheet(item: $reportTarget) { target in
            ReportSheet(target: target, session: session)
        }
    }

    /// The learner's league (its display name, from the tier the app last saw) and their XP on the board shown.
    /// Both come from what is already on the device or on the board: with neither, only the trophy and "League".
    private var heroCard: some View {
        let title = LeaguePresentation.tierTitle(tier: LeagueTierCache.lastKnownTier)
        let xp = LeaguePresentation.myXP(rows: rows.map { (userID: $0.userID, xp: $0.xp) }, myID: session.userID)
        return DSHeroCard {
            HStack(spacing: AlphonsoDS.Space.s3) {
                Icon3DView(emoji: "\u{1F3C6}", size: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s1)
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                    if title != nil {
                        Text("Your league").dsText(.overline).foregroundStyle(ds.onHeroKick)
                    }
                    Text(title ?? "League").dsText(.title)
                        .accessibilityAddTraits(.isHeader)
                }
                Spacer(minLength: AlphonsoDS.Space.s2)
                if let xp {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("\(xp)").dsText(.numeral)
                        Text("XP").dsText(.caption).foregroundStyle(ds.onHeroSoft)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(xp) XP")
                }
            }
        }
    }

    /// Optimistically drops `target` from `rows` on success -- the server
    /// already excludes a blocked relationship from get_leaderboard, this
    /// just avoids waiting for the next scope/period reload to see it.
    /// Reuses the existing toast banner (not the full-screen `errorMessage`
    /// state, which would blank the whole leaderboard) for feedback.
    private func block(_ target: SocialTarget) async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            let result = try await client.blockUser(target.id)
            if result.ok {
                BlockedUserSignal.post(userID: target.id)
                rows.removeAll { $0.userID == target.id }
                showToast("\(target.displayName) blocked.", into: $overtakeToastMessage)
            } else {
                showToast("Couldn't block \(target.displayName). Try again.", into: $overtakeToastMessage)
            }
        } catch {
            showToast("Couldn't block \(target.displayName). Try again.", into: $overtakeToastMessage)
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
    let onBlock: () -> Void
    let onReport: () -> Void

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            DSRankBadge(rank: rank)

            // Their animal, or their initial on their colour (ProfileAvatars, AvatarColor).
            ProfileAvatarView(seed: row.avatarSeed, name: row.displayName, size: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s2)

            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1 / 2) {
                HStack(spacing: AlphonsoDS.Space.s2) {
                    // The flag, only for a learner who turned it on (profiles.country is set only then), before the
                    // name; VoiceOver still hears the code.
                    if let flag = ProfileMath.flagEmoji(country: row.country) {
                        Text(flag)
                            .accessibilityLabel(ProfileMath.flagAccessibilityLabel(country: row.country) ?? "")
                    }
                    Text(row.displayName)
                        .dsText(.headline)
                        .foregroundStyle(ds.ink)
                        .lineLimit(2)
                    if isYou {
                        DSPill(text: "YOU", tone: .gold)
                    }
                }
                // A code that draws no flag (malformed) still shows as text; a valid one is the flag above.
                if let country = row.country, ProfileMath.flagEmoji(country: country) == nil {
                    Text(country.uppercased())
                        .dsText(.caption)
                        .foregroundStyle(ds.inkSoft)
                }
            }

            Spacer(minLength: AlphonsoDS.Space.s2)

            Text("\(row.xp) XP")
                .dsText(.headline)
                .foregroundStyle(ds.ink)

            if !isYou {
                SocialSafetyMenu(onBlock: onBlock, onReport: onReport, accessibilityName: row.displayName)
            }
        }
        .padding(.horizontal, AlphonsoDS.Space.s2)
        .padding(.vertical, AlphonsoDS.Space.s2)
        .frame(minHeight: AlphonsoDS.Space.minTouch)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(isYou ? ds.choiceTint : Color.clear))
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

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView().tint(ds.choice).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(spacing: AlphonsoDS.Space.s3) {
                            DSHeroCard(spacing: AlphonsoDS.Space.s1) {
                                Text("Last week you earned").dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                                Text("\(lastWeekXP ?? 0) XP").dsText(.displayXL)
                            }
                            .accessibilityElement(children: .combine)

                            if let currentRank {
                                DSCard(spacing: AlphonsoDS.Space.s2) {
                                    Text("Your rank today (global, weekly)").dsText(.caption).foregroundStyle(ds.inkSoft)
                                    Text("#\(currentRank)").dsText(.title).foregroundStyle(ds.brand)
                                    Text("Approximate: this app doesn't keep a snapshot of last week's exact standings.")
                                        .dsText(.caption)
                                        .foregroundStyle(ds.inkSoft)
                                }
                                .accessibilityElement(children: .combine)
                            }

                            if let promotedToTier {
                                DSCard(spacing: AlphonsoDS.Space.s2) {
                                    HStack(spacing: AlphonsoDS.Space.s3) {
                                        Image(systemName: "arrow.up.circle.fill")
                                            .font(.title)
                                            .foregroundStyle(LeagueTierPalette.color(for: promotedToTier))
                                            .accessibilityHidden(true)
                                        Text("You moved up to \(LeagueTierPalette.label(for: promotedToTier))!")
                                            .dsText(.headline)
                                            .foregroundStyle(ds.ink)
                                    }
                                }
                                .accessibilityElement(children: .combine)
                            }
                        }
                        .padding(AlphonsoDS.Space.gutter)
                    }
                }
            }
            .background(ds.surface)
            .navigationTitle("Weekly recap")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .tint(ds.choice)
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
