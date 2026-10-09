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
    /// Tells the friends list who the current buddy is, so blocking them from a friend row uses the buddy wording.
    var onBuddyChange: (String?) -> Void = { _ in }

    @State private var buddy: MyBuddy?
    @State private var requests: [BuddyRequest] = []
    @State private var messages: [BuddyMessage] = []
    @State private var pool: BuddyPool?
    @State private var blockTarget: SocialTarget?
    /// Declared-age confirmation for matching (owner decision: minimum age 13); the server refuses without it.
    @State private var ageConfirmed = false
    @State private var reportTarget: SocialTarget?
    @State private var isLoading = true
    /// The spinner shows only before the first result; later reloads keep the section on screen.
    @State private var hasLoaded = false
    @State private var loadFailed = false
    @State private var busy = false
    @State private var message: String?
    @State private var confirmingEnd = false
    @State private var loadGeneration = 0

    var body: some View {
        Section {
            if !hasLoaded && !loadFailed {
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
        // Loads on appear, then refreshes every minute while the section is on screen (no realtime socket, spec Part 3).
        .task {
            await load()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                guard !Task.isCancelled else { return }
                await load()
            }
        }
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
        .confirmationDialog(
            BuddyCopy.blockConfirm(blockTarget?.displayName ?? "your buddy"),
            isPresented: Binding(get: { blockTarget != nil }, set: { if !$0 { blockTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button("Block", role: .destructive) {
                if let target = blockTarget { Task { await block(target) } }
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

    @ViewBuilder
    private func buddyRows(_ buddy: MyBuddy) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
                HStack {
                    Text(buddy.buddyName)
                        .font(AlphonsoFont.display(17, weight: .semiBold))
                        .foregroundStyle(AlphonsoColor.ink)
                    if buddy.isMatch {
                        Text(BuddyCopy.matchedLabel)
                            .font(AlphonsoFont.sans(11))
                            .foregroundStyle(AlphonsoColor.inkSoft)
                    }
                }
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
            if buddy.isMatch {
                Spacer()
                // A matched buddy is not a friend: block and report live right here (guideline 1.2). Kept OUTSIDE the
                // combined element above so VoiceOver can reach it as its own button.
                SocialSafetyMenu(
                    onBlock: { blockTarget = SocialTarget(id: buddy.buddyID, displayName: buddy.buddyName) },
                    onReport: { reportTarget = SocialTarget(id: buddy.buddyID, displayName: buddy.buddyName) },
                    accessibilityName: buddy.buddyName
                )
                .buttonStyle(.borderless)
            }
        }
        if buddy.canSendPresets {
            Menu("Send \(buddy.buddyName) a message") {
                ForEach(BuddyCopy.presets, id: \.id) { preset in
                    Button(preset.text) {
                        Task { await run { try await $0.sendBuddyMessage(presetID: preset.id) } }
                    }
                }
            }
            .tint(AlphonsoColor.moss)
            .disabled(busy)
        } else {
            // Matching is switched off; the server refuses this pair's presets (matching_paused).
            Text(BuddyCopy.statusMessage("matching_paused"))
                .font(AlphonsoFont.sans(12))
                .foregroundStyle(AlphonsoColor.inkSoft)
        }
        ForEach(historyLines(buddy)) { item in
            Text(item.line)
                .font(AlphonsoFont.sans(12))
                .foregroundStyle(AlphonsoColor.ink)
        }
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
        matchingRows
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

    /// Opt-in matching (Phase 3b). A waiting learner can always stop looking, even while matching is switched off;
    /// only the find buttons depend on the switch.
    @ViewBuilder
    private var matchingRows: some View {
        if let pool, pool.waiting, let course = pool.course {
            HStack {
                Text(BuddyCopy.waitingLine(course))
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.ink)
                Spacer()
                Button(BuddyCopy.stopLooking) { Task { await run { try await $0.leaveBuddyPool() } } }
                    .tint(AlphonsoColor.inkSoft)
                    .buttonStyle(.borderless)
                    .disabled(busy)
            }
        } else if let pool, pool.matchingEnabled, !pool.courses.isEmpty {
            Text(BuddyCopy.poolIntro)
                .font(AlphonsoFont.sans(12))
                .foregroundStyle(AlphonsoColor.inkSoft)
            Toggle(BuddyCopy.ageConfirm, isOn: $ageConfirmed)
                .font(AlphonsoFont.sans(13))
                .tint(AlphonsoColor.moss)
            ForEach(pool.courses, id: \.self) { course in
                Button(BuddyCopy.findButton(course)) {
                    Task { await run { try await $0.joinBuddyPool(course: course, ageConfirmed: ageConfirmed) } }
                }
                .tint(AlphonsoColor.moss)
                .disabled(busy || !ageConfirmed)
            }
        }
    }

    /// The last 10 messages as display lines; a preset this client does not know is skipped.
    private func historyLines(_ buddy: MyBuddy) -> [HistoryLine] {
        messages.suffix(10).compactMap { message in
            BuddyCopy.messageLine(isMine: message.isMine, buddyName: buddy.buddyName, presetID: message.presetID)
                .map { HistoryLine(id: message.id, line: $0) }
        }
    }

    private struct HistoryLine: Identifiable {
        let id: String
        let line: String
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

    /// Returns true when this load's result was applied (it was still the newest load and not cancelled).
    @discardableResult
    private func load() async -> Bool {
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        guard let client = await makeClient() else {
            // freshAccessToken() also answers nil when the refresh was cancelled; a cancelled load is not a failure.
            if generation == loadGeneration, !Task.isCancelled { isLoading = false; loadFailed = true }
            return false
        }
        do {
            let newBuddy = try await client.getMyBuddy()
            let newRequests = try await client.getBuddyRequests()
            // Messages only while paired; their failure is a load failure, never an empty history.
            let newMessages = newBuddy == nil ? [] : try await client.getBuddyMessages()
            // Matching state only while unpaired; its failure is a load failure, never "matching is off".
            let newPool = newBuddy == nil ? try await client.getBuddyPool() : nil
            guard generation == loadGeneration else { return false }
            pool = newPool
            buddy = newBuddy
            onBuddyChange(newBuddy?.buddyID)
            requests = newRequests
            messages = newMessages
            loadFailed = false
            hasLoaded = true
            // An answer describes the state before this load; it must not outlive it (web: the stamp in BuddyCard).
            message = nil
            isLoading = false
            return true
        } catch {
            // A cancelled load (the view went away) is not a failure; only the newest load may report one.
            guard generation == loadGeneration, !Task.isCancelled else { return false }
            loadFailed = true
            isLoading = false
            return false
        }
    }

    /// Blocking a matched buddy ends the pair on the server (trigger). Reload, then say so in the buddy wording.
    private func block(_ target: SocialTarget) async {
        busy = true
        defer { busy = false }
        var failure: String?
        if let client = await makeClient() {
            do {
                if try await client.blockUser(target.id).ok == false {
                    failure = BuddyCopy.statusMessage("unknown")
                } else {
                    BlockedUserSignal.post(userID: target.id)
                }
            } catch {
                failure = SocialReasonCopy.failureMessage(for: error)
            }
        } else {
            failure = Copy.connectionFailure
        }
        await load()
        message = failure ?? BuddyCopy.blockedLine(target.displayName)
    }

    /// Runs a buddy action, shows the server's answer in fixed wording (or what actually failed), then reloads.
    private func run(_ action: @escaping (ProgressSyncClient) async throws -> String) async {
        busy = true
        message = nil
        var text: String
        if let client = await makeClient() {
            do {
                text = BuddyCopy.statusMessage(try await action(client))
            } catch {
                text = SocialReasonCopy.failureMessage(for: error)
            }
        } else {
            text = Copy.connectionFailure
        }
        // The answer is shown only with the state its own reload produced; a superseded reload drops it.
        if await load() { message = text }
        busy = false
    }
}
