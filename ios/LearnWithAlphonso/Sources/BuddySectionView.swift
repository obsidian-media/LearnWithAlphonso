import SwiftUI
import LearnWithAlphonsoKit

/// The Friends screen's study buddy section (study together Phase 4; web: src/components/BuddyCard.tsx). It renders
/// what `get_my_buddy` / `get_buddy_requests` return and does no week maths of its own; every word comes from
/// `BuddyCopy` (tested in the Kit against the shared fixtures), so it reads exactly like the web card.
///
/// A failed lookup shows `BuddyCopy.loadFailed` with Try again, never the "pick a friend" state (the Teams screens
/// once showed "no team" on a failure, which hid broken team functions, PR #237). Only the newest load is applied,
/// and a cancelled load is not a failure. Compiled by CI's ios-app-build but NOT run on a device by the change that
/// added it.
struct BuddySection: View {
    let session: Session
    /// The accepted friends already loaded by FriendsView: the people who can be asked.
    let friends: [FriendProgress]

    @State private var buddy: MyBuddy?
    @State private var requests: [BuddyRequest] = []
    @State private var isLoading = true
    @State private var loadFailed = false
    @State private var busy = false
    @State private var message: String?
    @State private var confirmingEnd = false
    @State private var loadGeneration = 0

    var body: some View {
        Section {
            if isLoading && buddy == nil && !loadFailed {
                ProgressView().tint(AlphonsoColor.moss)
            } else if loadFailed {
                Text(BuddyCopy.loadFailed)
                    .font(AlphonsoFont.sans(15))
                    .foregroundStyle(AlphonsoColor.ink)
                Button("Try again") { Task { await load() } }
                    .tint(AlphonsoColor.moss)
            } else if let buddy {
                buddyRows(buddy)
            } else {
                noBuddyRows
            }
            if let message {
                Text(message)
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
        } header: {
            Text("Study buddy")
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
        }
        .listRowBackground(AlphonsoColor.parchment)
        .task { await load() }
        .confirmationDialog(
            BuddyCopy.endConfirm(buddy?.buddyName ?? "your buddy"),
            isPresented: $confirmingEnd,
            titleVisibility: .visible
        ) {
            Button("Yes, end", role: .destructive) {
                Task { await run { try await $0.endBuddy() } }
            }
            Button("Keep", role: .cancel) {}
        }
    }

    @ViewBuilder
    private func buddyRows(_ buddy: MyBuddy) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
            Text(buddy.buddyName)
                .font(AlphonsoFont.display(17, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            Text(BuddyCopy.weekLine(myCount: buddy.myCount, buddyCount: buddy.buddyCount, goal: buddy.goal))
                .font(AlphonsoFont.sans(14))
                .foregroundStyle(AlphonsoColor.ink)
            Text(BuddyCopy.streakLine(buddy.streakWeeks))
                .font(AlphonsoFont.sans(12))
                .foregroundStyle(AlphonsoColor.inkSoft)
            Text(BuddyCopy.graceLine(buddy.graceAvailable))
                .font(AlphonsoFont.sans(12))
                .foregroundStyle(AlphonsoColor.inkSoft)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        Button("End study buddy", role: .destructive) { confirmingEnd = true }
            .tint(AlphonsoColor.destructive)
            .disabled(busy)
    }

    @ViewBuilder
    private var noBuddyRows: some View {
        Text(BuddyCopy.intro)
            .font(AlphonsoFont.sans(12))
            .foregroundStyle(AlphonsoColor.inkSoft)
        ForEach(requests) { request in
            if request.direction == .incoming {
                VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
                    Text(BuddyCopy.incomingLine(request.otherName))
                        .font(AlphonsoFont.sans(14))
                        .foregroundStyle(AlphonsoColor.ink)
                    HStack(spacing: AlphonsoSpacing.md) {
                        Button("Accept") {
                            Task { await run { try await $0.respondBuddyRequest(requestID: request.id, accept: true) } }
                        }
                        .tint(AlphonsoColor.moss)
                        // Two buttons in one List row: without an explicit style a tap anywhere fires both.
                        .buttonStyle(.borderless)
                        Button("Decline") {
                            Task { await run { try await $0.respondBuddyRequest(requestID: request.id, accept: false) } }
                        }
                        .tint(AlphonsoColor.inkSoft)
                        .buttonStyle(.borderless)
                    }
                    .disabled(busy)
                }
            } else {
                HStack {
                    Text(BuddyCopy.outgoingLine(request.otherName))
                        .font(AlphonsoFont.sans(14))
                        .foregroundStyle(AlphonsoColor.ink)
                    Spacer()
                    Button("Cancel request") {
                        Task { await run { try await $0.cancelBuddyRequest(requestID: request.id) } }
                    }
                    .tint(AlphonsoColor.inkSoft)
                    .buttonStyle(.borderless)
                    .disabled(busy)
                }
            }
        }
        if !askable.isEmpty {
            Menu("Ask a friend to be your study buddy") {
                ForEach(askable, id: \.userID) { friend in
                    Button(friend.displayName) {
                        Task { await run { try await $0.requestBuddy(friendID: friend.userID) } }
                    }
                }
            }
            .tint(AlphonsoColor.moss)
            .disabled(busy)
        }
    }

    /// Friends with no pending request either way (the server answers the rest, but offering them would only fail).
    private var askable: [FriendProgress] {
        let pending = Set(requests.map(\.otherID))
        return friends.filter { !pending.contains($0.userID) }
    }

    private func makeClient() async -> ProgressSyncClient? {
        // The refreshed token, like the team mission card: the stored one may have expired.
        guard let accessToken = await session.freshAccessToken() else { return nil }
        return ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
    }

    private func load() async {
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        guard let client = await makeClient() else {
            if generation == loadGeneration { isLoading = false; loadFailed = true }
            return
        }
        do {
            let newBuddy = try await client.getMyBuddy()
            let newRequests = try await client.getBuddyRequests()
            guard generation == loadGeneration else { return }
            buddy = newBuddy
            requests = newRequests
            loadFailed = false
        } catch {
            // A cancelled load (the view went away) is not a failure; only the newest load may report one.
            guard generation == loadGeneration, !Task.isCancelled else { return }
            loadFailed = true
        }
        isLoading = false
    }

    /// Runs a buddy action, shows the server's answer in fixed wording, then reloads (busy until the reload lands, so
    /// a second tap cannot act on a request that is already gone).
    private func run(_ action: @escaping (ProgressSyncClient) async throws -> String) async {
        busy = true
        message = nil
        var text = BuddyCopy.statusMessage("unknown")
        if let client = await makeClient(), let status = try? await action(client) {
            text = BuddyCopy.statusMessage(status)
        }
        await load()
        message = text
        busy = false
    }
}
