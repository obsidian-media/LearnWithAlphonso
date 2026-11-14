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
/// Accepting an invite someone sent *you*: the link opens the app (Universal Link, apple-app-site-association) on
/// FriendInviteAccept.swift's sheet, and a link that opened in the browser can be pasted below the share button.
struct FriendsView: View {
    let session: Session

    @State private var friends: [FriendProgress] = []
    @State private var activityEvents: [FriendActivityEvent] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var nudgeBannerMessage: String?
    @State private var friendPendingRemoval: FriendProgress?
    @State private var friendPendingBlock: FriendProgress?
    @State private var currentBuddyID: String?
    @State private var reportTarget: SocialTarget?
    @State private var inviteLink: URL?
    @State private var pastedInvite = ""
    @Environment(PendingInvite.self) private var pendingInvite

    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                List {
                    DSGlassTitle(title: "Friends", subtitle: friends.isEmpty ? nil : friendsCountTitle)
                        .dsListRow(top: AlphonsoDS.Space.s2)

                    inviteCard
                        .dsListRow()

                    BuddySection(session: session, friends: friends, onBuddyChange: { currentBuddyID = $0 })
                        .dsListRow()

                    DSOverline(friendsCountTitle).dsListRow(bottom: AlphonsoDS.Space.s2)
                    if isLoading {
                        DSCard { ProgressView().tint(ds.choice).frame(maxWidth: .infinity) }
                            .dsListRow()
                    } else if let errorMessage {
                        DSCard { Text(errorMessage).dsText(.body).foregroundStyle(ds.inkSoft) }
                            .dsListRow()
                    } else if friends.isEmpty {
                        DSEmptyState(art: "Alphonso-waving", title: "No friends yet. Share your invite link to get started.")
                            .dsListRow()
                    } else {
                        ForEach(friends, id: \.userID) { friend in
                            FriendRowView(friend: friend) {
                                await nudge(friend)
                            } onBlock: {
                                friendPendingBlock = friend
                            } onReport: {
                                reportTarget = SocialTarget(id: friend.userID, displayName: friend.displayName)
                            }
                            .dsListRow(bottom: AlphonsoDS.Space.s2)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    friendPendingRemoval = friend
                                } label: {
                                    Label("Remove", systemImage: "person.badge.minus")
                                }
                            }
                        }
                    }

                    if !activityEvents.isEmpty {
                        DSOverline("Activity").dsListRow(bottom: AlphonsoDS.Space.s2)
                        DSCard(spacing: AlphonsoDS.Space.s2) {
                            ForEach(activityEvents) { event in
                                ActivityEventRow(event: event, displayName: displayName(for: event.userID))
                            }
                        }
                        .dsListRow()
                    }
                }
                .dsSceneList(.practice)

                if let nudgeBannerMessage {
                    ToastBanner(message: nudgeBannerMessage, iconName: "hand.wave.fill")
                        .padding(.top, AlphonsoDS.Space.s1)
                        .transition(ToastBanner.transition(reduceMotion: reduceMotion))
                }
            }
            .navigationTitle("Friends")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    NavigationLink("Duels") {
                        DuelsView(session: session)
                    }
                }
            }
        }
        .tint(ds.choice)
        .task { await loadAll() }
        // The invite sheet closing (an accept) means the list may have a new friend.
        .onChange(of: pendingInvite.code) { old, new in
            if old != nil, new == nil { Task { await loadAll() } }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                Task { await checkForNudges() }
            }
        }
        .alphonsoChoiceDialog(
            "Remove \(friendPendingRemoval?.displayName ?? "this friend")?",
            isPresented: Binding(
                get: { friendPendingRemoval != nil },
                set: { if !$0 { friendPendingRemoval = nil } },
            ),
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
        .alphonsoChoiceDialog(
            friendPendingBlock.map { $0.userID == currentBuddyID ? BuddyCopy.blockConfirm($0.displayName) : "Block \($0.displayName)?" }
                ?? "Block this friend?",
            isPresented: Binding(
                get: { friendPendingBlock != nil },
                set: { if !$0 { friendPendingBlock = nil } },
            ),
        ) {
            Button("Block", role: .destructive) {
                if let friend = friendPendingBlock {
                    Task { await block(friend) }
                }
                friendPendingBlock = nil
            }
            Button("Cancel", role: .cancel) { friendPendingBlock = nil }
        } message: {
            Text(SocialSafetyCopy.blockConfirmationMessage(friendPendingBlock?.displayName ?? "This person"))
        }
        .sheet(item: $reportTarget) { target in
            ReportSheet(target: target, session: session)
        }
    }

    /// Invite a friend: the share link, and a field for a friend's link that opened in the browser.
    private var inviteCard: some View {
        DSCard {
            HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                Icon3DView(emoji: "\u{1F91D}", size: AlphonsoDS.Space.s12)
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                    Text("Invite a friend")
                        .dsText(.title)
                        .foregroundStyle(ds.brand)
                    Text("Share your link. When they open it and tap Add friend, you're friends.")
                        .dsText(.footnote)
                        .foregroundStyle(ds.inkSoft)
                }
            }
            if let inviteLink {
                ShareLink(item: inviteLink) {
                    Label("Share invite link", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.dsButton(.primary))
            }
            // A friend's link that opened in the browser instead of the app can be pasted here.
            HStack(spacing: AlphonsoDS.Space.s3) {
                TextField("Paste a friend's link", text: $pastedInvite)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .onSubmit(openPastedInvite)
                    .dsField()
                Button("Open", action: openPastedInvite)
                    .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                    .disabled(FriendInviteLink.code(fromEntry: pastedInvite) == nil)
            }
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
        // 2026-09-30 audit (Codex/Fable): this used to build the invite
        // link from session.userID directly -- see
        // 20260930140000_fix_friend_invite_forgeable_uuid.sql for why a
        // uuid-keyed invite let anyone force a friendship with zero
        // consent. Now fetches the caller's own opaque invite code
        // instead; a raw uuid in the URL no longer resolves to anything.
        if let code = try? await client.getMyFriendCode() {
            inviteLink = AppConfig.apiBaseURL.appendingPathComponent("invite/\(code)")
        }
        isLoading = false
        await checkForNudges()
    }

    private func openPastedInvite() {
        guard let code = FriendInviteLink.code(fromEntry: pastedInvite) else { return }
        pastedInvite = ""
        pendingInvite.code = code
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

    /// Optimistically drops `friend` from both `friends` and
    /// `activityEvents` on success -- the server already filters a
    /// blocked relationship out of get_friends_progress/friend activity,
    /// this just avoids waiting for the next full reload to see it.
    private func block(_ friend: FriendProgress) async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            let result = try await client.blockUser(friend.userID)
            if result.ok {
                BlockedUserSignal.post(userID: friend.userID)
                friends.removeAll { $0.userID == friend.userID }
                activityEvents.removeAll { $0.userID == friend.userID }
                showToast("\(friend.displayName) blocked.", into: $nudgeBannerMessage)
            } else {
                showToast("Couldn't block \(friend.displayName). Try again.", into: $nudgeBannerMessage)
            }
        } catch {
            showToast("Couldn't block \(friend.displayName). Try again.", into: $nudgeBannerMessage)
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
    let onBlock: () -> Void
    let onReport: () -> Void

    @State private var canNudge = true
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: AlphonsoDS.Space.s2))
            : AnyLayout(HStackLayout(spacing: AlphonsoDS.Space.s3))
        DSCard(padding: AlphonsoDS.Space.s3) {
            layout {
                // Their animal, or their initial on their colour (ProfileAvatars).
                ProfileAvatarView(seed: friend.avatarSeed, name: friend.displayName, size: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s2)

                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1 / 2) {
                    Text(friend.displayName)
                        .dsText(.headline)
                        .foregroundStyle(ds.ink)
                    Text("\u{1F525} \(friend.streak)-day streak")
                        .dsText(.caption)
                        .foregroundStyle(ds.inkSoft)
                }

                if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: AlphonsoDS.Space.s2) }

                VStack(alignment: dynamicTypeSize.isAccessibilitySize ? .leading : .trailing, spacing: AlphonsoDS.Space.s1 / 2) {
                    Text("\(friend.weekXP)")
                        .dsText(.headline)
                        .foregroundStyle(ds.ink)
                    Text("XP this week")
                        .dsText(.caption)
                        .foregroundStyle(ds.inkSoft)
                }

                HStack(spacing: AlphonsoDS.Space.s2) {
                    Button {
                        canNudge = false
                        Task { await onNudge() }
                    } label: {
                        Image(systemName: "hand.wave")
                    }
                    .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                    .disabled(!canNudge)
                    .accessibilityLabel("Nudge \(friend.displayName)")

                    SocialSafetyMenu(onBlock: onBlock, onReport: onReport, accessibilityName: friend.displayName)
                }
            }
        }
        .onAppear { canNudge = NudgeCooldownCache.canNudge(friendID: friend.userID) }
    }
}

private struct ActivityEventRow: View {
    let event: FriendActivityEvent
    let displayName: String
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            Icon3DView(emoji: emoji, size: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s1)
            Text(copy)
                .dsText(.body)
                .foregroundStyle(ds.ink)
            Spacer(minLength: 0)
        }
        .padding(.vertical, AlphonsoDS.Space.s1)
        .accessibilityElement(children: .combine)
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
            let tier = event.newTier.map(LeagueTierCopy.label(for:)) ?? "a new league"
            return "\(displayName) moved up to \(tier)"
        default:
            return "\(displayName) made progress"
        }
    }

    /// A 3D icon per kind of event: a tick, a flame, a trophy, and sparkles for one this build does not know.
    private var emoji: String {
        switch event.eventType {
        case "lesson_completed": return "\u{2705}"
        case "streak_milestone": return "\u{1F525}"
        case "league_promotion": return "\u{1F3C6}"
        default: return "\u{2728}"
        }
    }
}
