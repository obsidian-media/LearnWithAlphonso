import SwiftUI
import LearnWithAlphonsoKit

/// Port of the web app's invite-link friends system
/// (src/routes/_authenticated/profile_.friends.tsx): share your own invite
/// link, see friends' streak/weekly-XP via get_friends_progress -- no
/// backend changes, same direct-RPC-via-PostgREST pattern as leaderboards.
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
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var inviteLink: URL? {
        guard let userID = session.userID else { return nil }
        return AppConfig.apiBaseURL.appendingPathComponent("invite/\(userID)")
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Invite a friend").font(.headline)
                        Text("Share your link — when they open it, you're automatically friends.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let inviteLink {
                            ShareLink(item: inviteLink) {
                                Label("Share invite link", systemImage: "square.and.arrow.up")
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section(friendsCountTitle) {
                    if isLoading {
                        ProgressView()
                    } else if let errorMessage {
                        Text(errorMessage).foregroundStyle(.secondary)
                    } else if friends.isEmpty {
                        Text("No friends yet. Share your invite link to get started.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(friends, id: \.userID) { friend in
                            FriendRowView(friend: friend)
                        }
                    }
                }
            }
            .navigationTitle("Friends")
        }
        .task { await load() }
    }

    private var friendsCountTitle: String {
        friends.isEmpty ? "Your friends" : "\(friends.count) friend\(friends.count == 1 ? "" : "s")"
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
            friends = try await client.fetchFriendsProgress()
        } catch {
            errorMessage = "Check your connection and try again."
        }
        isLoading = false
    }
}

private struct FriendRowView: View {
    let friend: FriendProgress

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(AvatarColor.forSeed(friend.avatarSeed))
                .frame(width: 40, height: 40)
                .overlay(
                    Text(friend.displayName.prefix(1).uppercased())
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(friend.displayName).font(.subheadline.weight(.semibold))
                Text("\u{1F525} \(friend.streak)-day streak")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(friend.weekXP)").font(.subheadline.weight(.semibold))
                Text("XP this week").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
