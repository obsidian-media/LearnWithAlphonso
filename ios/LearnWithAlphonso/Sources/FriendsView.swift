import SwiftUI
import LearnWithAlphonsoKit

/// Port of the web app's invite-link friends system
/// (src/routes/_authenticated/profile_.friends.tsx): share your own invite
/// link, see friends' streak/weekly-XP via get_friends_progress -- no
/// backend changes, same direct-RPC-via-PostgREST pattern as leaderboards.
/// Also the deepened V2 features (docs/v2-kickoffs/04-friends-and-social.md):
/// an activity feed (friend_activity_events, written by complete-lesson)
/// and nudge-a-friend (deliberately the weaker, polling-based V2 version --
/// see NudgeCooldownCache's doc comment and ARCHITECTURE.md's note on what
/// a real V3 push-based version needs).
///
/// Accepting an invite someone sent *you* is out of scope for this slice:
/// Universal Links are deliberately deferred (see
/// docs/superpowers/specs/2026-09-19-ios-friends-design.md), so a friend's
/// invite link opens in Safari and hits the existing (already-working) web
/// route instead. Friends made that way still show up here regardless --
/// get_friends_progress reads the same backend/account the web app writes
/// to, so this view is at minimum a *read* surface for friends made
/// anywhere, even with no accept-flow UI on iOS yet.
struct FriendsView: View {
    let session: Session

    @State private var friends: [FriendProgress] = []
    @State private var activityEvents: [FriendActivityEvent] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var nudgeBannerMessage: String?
    @State private var friendPendingRemoval: FriendProgress?

    @Environment(\.scenePhase) private var scenePhase

    private var inviteLink: URL? {
        guard let userID = session.userID else { return nil }
        return AppConfig.apiBaseURL.appendingPathComponent("invite/\(userID)")
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                List {
                    Section {
                        VStack(alignment: .leading, spacing: AlphonsoSpacing.xs + 4) {
                            Text("Invite a friend")
                                .font(AlphonsoFont.display(17, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.ink)
                            Text("Share your link — when they open it, you're automatically friends.")
                                .font(AlphonsoFont.sans(12))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                            if let inviteLink {
                                ShareLink(item: inviteLink) {
                                    Label("Share invite link", systemImage: "square.and.arrow.up")
                                }
                                .buttonStyle(.alphonsoPrimary(fullWidth: false))
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowBackground(AlphonsoColor.parchment)

                    Section {
                        if isLoading {
                            ProgressView().tint(AlphonsoColor.moss)
                        } else if let errorMessage {
                            Text(errorMessage).foregroundStyle(AlphonsoColor.inkSoft)
                        } else if friends.isEmpty {
                            Text("No friends yet. Share your invite link to get started.")
                                .foregroundStyle(AlphonsoColor.inkSoft)
                        } else {
                            ForEach(friends, id: \.userID) { friend in
                                FriendRowView(friend: friend) {
                                    await nudge(friend)
                                }
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        friendPendingRemoval = friend
                                    } label: {
                                        Label("Remove", systemImage: "person.badge.minus")
                                    }
                                }
                            }
                        }
                    } header: {
                        Text(friendsCountTitle)
                            .font(AlphonsoFont.sans(12, weight: .semiBold))
                            .tracking(0.4)
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                    .listRowBackground(AlphonsoColor.parchment)

                    if !activityEvents.isEmpty {
                        Section {
                            ForEach(activityEvents) { event in
                                ActivityEventRow(event: event, displayName: displayName(for: event.userID))
                            }
                        } header: {
                            Text("Activity")
                                .font(AlphonsoFont.sans(12, weight: .semiBold))
                                .tracking(0.4)
                                .foregroundStyle(AlphonsoColor.ember)
                        }
                        .listRowBackground(AlphonsoColor.parchment)
                    }
                }
                .scrollContentBackground(.hidden)
                .background(AlphonsoColor.surface)

                if let nudgeBannerMessage {
                    ToastBanner(message: nudgeBannerMessage, iconName: "hand.wave.fill")
                        .padding(.top, 4)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .navigationTitle("Friends")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    NavigationLink("Duels") {
                        DuelsView(session: session)
                    }
                }
            }
        }
        .tint(AlphonsoColor.moss)
        .task { await loadAll() }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                Task { await checkForNudges() }
            }
        }
        .confirmationDialog(
            "Remove \(friendPendingRemoval?.displayName ?? "this friend")?",
            isPresented: Binding(
                get: { friendPendingRemoval != nil },
                set: { if !$0 { friendPendingRemoval = nil } },
            ),
            titleVisibility: .visible,
        ) {
            Button("Remove", role: .destructive) {
                if let friend = friendPendingRemoval {
                    Task { await removeFriend(friend) }
                }
                friendPendingRemoval = nil
            }
            Button("Cancel", role: .cancel) { friendPendingRemoval = nil }
        } message: {
            Text("You won't see each other's activity or streaks anymore.")
        }
    }

    private var friendsCountTitle: String {
        friends.isEmpty ? "Your friends" : "\(friends.count) friend\(friends.count == 1 ? "" : "s")"
    }

    /// A nudge's sender is only ever an accepted friend (RLS enforces
    /// this server-side too), so the already-fetched `friends` list is
    /// enough to resolve a display name -- no extra query needed.
    private func displayName(for userID: String) -> String {
        if userID == session.userID { return "You" }
        return friends.first { $0.userID == userID }?.displayName ?? "A friend"
    }

    private func loadAll() async {
        isLoading = true
        errorMessage = nil
        guard let accessToken = session.accessToken else {
            errorMessage = "You've been signed out. Please sign in again."
            isLoading = false
            return
        }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            friends = try await client.fetchFriendsProgress()
        } catch {
            errorMessage = "Check your connection and try again."
        }
        activityEvents = (try? await client.fetchFriendActivity()) ?? []
        isLoading = false
        await checkForNudges()
    }

    private func nudge(_ friend: FriendProgress) async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            try await client.sendNudge(recipientID: friend.userID)
            NudgeCooldownCache.recordNudge(friendID: friend.userID)
        } catch {
            // Non-critical -- a nudge is a nice-to-have, not worth surfacing an error for.
        }
    }

    private func removeFriend(_ friend: FriendProgress) async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            let result = try await client.removeFriend(friendID: friend.userID)
            if result.ok {
                friends.removeAll { $0.userID == friend.userID }
            }
        } catch {
            // Non-critical to surface as a blocking error -- the row simply
            // stays in the list, matching this file's existing precedent
            // (nudge failures are silent too) rather than a new error UI.
        }
    }

    /// Polling-based, deliberately the weaker V2 approach: checks for
    /// unread nudges whenever this screen appears or the app returns to
    /// foreground, not the instant one arrives. See this file's own doc
    /// comment and ARCHITECTURE.md for the real V3 recommendation.
    private func checkForNudges() async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        guard let unread = try? await client.fetchUnreadNudges(), !unread.isEmpty else { return }

        let names = unread.map { displayName(for: $0.senderID) }
        let message = names.count == 1
            ? "\(names[0]) nudged you!"
            : "\(names.count) friends nudged you!"
        showToast(message, into: $nudgeBannerMessage)

        try? await client.markNudgesRead(ids: unread.map(\.id))
    }
}

private struct FriendRowView: View {
    let friend: FriendProgress
    let onNudge: () async -> Void

    @State private var canNudge = true

    var body: some View {
        HStack(spacing: AlphonsoSpacing.sm + 4) {
            Circle()
                .fill(AvatarColor.forSeed(friend.avatarSeed))
                .frame(width: 40, height: 40)
                .overlay(
                    Text(friend.displayName.prefix(1).uppercased())
                        .font(AlphonsoFont.sans(14, weight: .semiBold))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(friend.displayName)
                    .font(AlphonsoFont.sans(15, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)
                Text("\u{1F525} \(friend.streak)-day streak")
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(friend.weekXP)")
                    .font(AlphonsoFont.sans(15, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)
                Text("XP this week")
                    .font(AlphonsoFont.sans(11))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }

            Button {
                canNudge = false
                Task { await onNudge() }
            } label: {
                Image(systemName: "hand.wave")
            }
            .buttonStyle(.alphonsoSecondary(fullWidth: false))
            .disabled(!canNudge)
        }
        .padding(.vertical, 4)
        .onAppear { canNudge = NudgeCooldownCache.canNudge(friendID: friend.userID) }
    }
}

private struct ActivityEventRow: View {
    let event: FriendActivityEvent
    let displayName: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: iconName)
                .foregroundStyle(iconColor)
                .frame(width: 24)
            Text(copy)
                .font(AlphonsoFont.sans(14))
                .foregroundStyle(AlphonsoColor.ink)
            Spacer()
        }
        .padding(.vertical, 2)
    }

    private var copy: String {
        switch event.eventType {
        case "lesson_completed":
            let xp = event.xpGain ?? 0
            return "\(displayName) completed a lesson (+\(xp) XP)"
        case "streak_milestone":
            let streak = event.streak ?? 0
            return "\(displayName) hit a \(streak)-day streak"
        case "league_promotion":
            let tier = (event.newTier ?? "a new league").capitalized
            return "\(displayName) moved up to \(tier)"
        default:
            return "\(displayName) made progress"
        }
    }

    private var iconName: String {
        switch event.eventType {
        case "lesson_completed": return "checkmark.circle.fill"
        case "streak_milestone": return "flame.fill"
        case "league_promotion": return "arrow.up.circle.fill"
        default: return "circle.fill"
        }
    }

    private var iconColor: Color {
        switch event.eventType {
        case "lesson_completed": return AlphonsoColor.moss
        case "streak_milestone": return AlphonsoColor.ember
        case "league_promotion": return AlphonsoColor.mossDeep
        default: return AlphonsoColor.inkSoft
        }
    }
}
