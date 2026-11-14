import SwiftUI
import LearnWithAlphonsoKit

/// V4 candidate #7 (deeper gamification) -- this codebase had zero
/// duel UI anywhere (web or iOS) despite createDuel/respondToDuel/
/// fetchMyDuels already being fully built, so this covers both the
/// pre-existing friend-duel flow and the new open-duel queue in one
/// view. Linked from FriendsView, not its own tab -- same
/// no-room-for-another-tab reasoning as TeamsView/SeasonView.
///
/// Drawn in the round-6 design system: the stage scene behind a glass title, a card per duel, chips for the
/// friend and the course. What the screen does is unchanged.
struct DuelsView: View {
    let session: Session

    private enum CourseOption: String, CaseIterable { case en, fr, es
        var label: String {
            switch self {
            case .en: return "English"
            case .fr: return "French"
            case .es: return "Spanish"
            }
        }
    }

    @State private var duels: [Duel] = []
    @State private var friends: [FriendProgress] = []
    @State private var challengeFriendID = ""
    @State private var challengeCourse: CourseOption = .en
    @State private var openCourse: CourseOption = .en
    @State private var matchByLevel = true
    @State private var queueing = false
    @State private var waitingInQueue = false
    @State private var errorMessage: String?
    @State private var isLoading = true
    @State private var duelBlockTarget: SocialTarget?
    @State private var duelReportTarget: SocialTarget?

    @Environment(\.alphonsoDS) private var ds

    private var myID: String? { session.userID }
    private var pending: [Duel] { duels.filter { $0.status == "pending" && $0.opponentID == myID } }
    private var active: [Duel] { duels.filter { $0.status == "active" } }
    private var finished: [Duel] { duels.filter { $0.status == "completed" || $0.status == "declined" } }

    private var courseOptions: [DSSegmented<CourseOption>.Option] {
        CourseOption.allCases.map { .init(value: $0, label: $0.label) }
    }

    var body: some View {
        // The loader is on this always-present List; every section below may draw nothing.
        List {
            DSGlassTitle(
                title: "Duels",
                subtitle: DuelsPresentation.summary(pending: pending.count, active: active.count, finished: finished.count)
            )
            .dsListRow(top: AlphonsoDS.Space.s2)

            if let errorMessage {
                DSCard { Text(errorMessage).dsText(.footnote).foregroundStyle(ds.wrongInk) }
                    .dsListRow()
            }

            if !pending.isEmpty {
                pendingSection
            }

            activeSection

            challengeFriendSection

            openDuelSection

            if !finished.isEmpty {
                pastDuelsSection
            }
        }
        .dsSceneList(.complete)
        .navigationTitle("Duels")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadAll() }
        .alphonsoChoiceDialog(
            "Block this opponent?",
            isPresented: Binding(
                get: { duelBlockTarget != nil },
                set: { if !$0 { duelBlockTarget = nil } },
            ),
        ) {
            Button("Block", role: .destructive) {
                if let target = duelBlockTarget {
                    Task { await block(target) }
                }
                duelBlockTarget = nil
            }
            Button("Cancel", role: .cancel) { duelBlockTarget = nil }
        } message: {
            Text(SocialSafetyCopy.blockConfirmationMessage("This person"))
        }
        .sheet(item: $duelReportTarget) { target in
            ReportSheet(target: target, session: session)
        }
    }

    /// Neither `pending` nor `active` duel rows carry a display name (this
    /// view never has shown opponent names, only course), so the block/
    /// report menu targets by id with a generic label rather than adding
    /// new name-resolution plumbing just for this.
    private func opponentTarget(for d: Duel) -> SocialTarget {
        SocialTarget(id: d.challengerID == myID ? d.opponentID : d.challengerID, displayName: "this opponent")
    }

    @ViewBuilder
    private func socialSafetyMenu(for d: Duel) -> some View {
        SocialSafetyMenu(
            onBlock: { duelBlockTarget = opponentTarget(for: d) },
            onReport: { duelReportTarget = opponentTarget(for: d) },
            accessibilityName: "your opponent"
        )
    }

    /// Existing duels with the now-blocked opponent are left as-is (block
    /// only prevents *future* challenges/matching -- see the migration's
    /// header comment); this only stops new contact, same as leaving past
    /// interactions alone rather than erasing history.
    private func block(_ target: SocialTarget) async {
        guard let client else { return }
        do {
            let result = try await client.blockUser(target.id)
            if result.ok { BlockedUserSignal.post(userID: target.id) }
            errorMessage = result.ok ? nil : (result.message.isEmpty ? "Couldn't block. Try again." : result.message)
        } catch {
            errorMessage = "Couldn't block. Try again."
        }
    }

    // MARK: Sections

    @ViewBuilder
    private var pendingSection: some View {
        DSOverline("Pending challenges").dsListRow()
        ForEach(pending) { d in
            DSCard {
                HStack(spacing: AlphonsoDS.Space.s3) {
                    Icon3DView(emoji: "\u{26A1}", size: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s2)
                    Text("Challenge (\(d.course))")
                        .dsText(.headline)
                        .foregroundStyle(ds.ink)
                    Spacer(minLength: AlphonsoDS.Space.s2)
                    socialSafetyMenu(for: d)
                }
                HStack(spacing: AlphonsoDS.Space.s3) {
                    Button("Accept") { Task { await respond(d, accept: true) } }
                        .buttonStyle(.dsButton(.primary, compact: true))
                    Button("Decline") { Task { await respond(d, accept: false) } }
                        .buttonStyle(.dsButton(.secondary, compact: true))
                }
            }
            .dsListRow()
        }
    }

    @ViewBuilder
    private var activeSection: some View {
        DSOverline("Active duels").dsListRow()
        if isLoading {
            DSCard { ProgressView().tint(ds.choice).frame(maxWidth: .infinity) }
                .dsListRow()
        } else if active.isEmpty {
            DSCard {
                Text("No active duels right now.").dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
            .dsListRow()
        } else {
            ForEach(active) { d in
                let mine = (d.challengerID == myID ? d.challengerXPNow - d.challengerXPStart : d.opponentXPNow - d.opponentXPStart)
                let theirs = (d.challengerID == myID ? d.opponentXPNow - d.opponentXPStart : d.challengerXPNow - d.challengerXPStart)
                DSCard {
                    HStack {
                        DSPill(text: d.course, tone: .info)
                        Spacer(minLength: AlphonsoDS.Space.s2)
                        socialSafetyMenu(for: d)
                    }
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                        HStack(alignment: .bottom) {
                            VStack(alignment: .leading, spacing: 0) {
                                Text("You").dsText(.caption).foregroundStyle(ds.inkSoft)
                                Text("+\(mine)").dsText(.numeral).foregroundStyle(ds.choice)
                            }
                            Spacer(minLength: AlphonsoDS.Space.s2)
                            VStack(alignment: .trailing, spacing: 0) {
                                Text("Them").dsText(.caption).foregroundStyle(ds.inkSoft)
                                Text("+\(theirs)").dsText(.numeral).foregroundStyle(ds.inkSoft)
                            }
                        }
                        DSProgressBar(fraction: DuelsPresentation.share(mine: mine, theirs: theirs), tint: ds.choice)
                        Text("You: +\(mine)  \u{00B7}  Them: +\(theirs)").dsText(.footnote).foregroundStyle(ds.inkSoft)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(d.course) duel. You: +\(mine). Them: +\(theirs).")
                }
                .dsListRow()
            }
        }
    }

    @ViewBuilder
    private var challengeFriendSection: some View {
        DSOverline("Challenge a friend").dsListRow()
        DSCard {
            Text("Friend").dsText(.caption).foregroundStyle(ds.inkSoft)
            if friends.isEmpty {
                Text("No friends yet. Share your invite link to get started.")
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
            } else {
                LessonFlowLayout {
                    ForEach(friends, id: \.userID) { f in
                        DSChip(
                            label: f.displayName, selected: challengeFriendID == f.userID,
                            accessibilityText: nil, action: { challengeFriendID = f.userID }
                        ) {
                            ProfileAvatarView(seed: f.avatarSeed, name: f.displayName, size: AlphonsoDS.Space.s6 + AlphonsoDS.Space.s1)
                        }
                    }
                }
            }
            Text("Course").dsText(.caption).foregroundStyle(ds.inkSoft)
            DSSegmented(options: courseOptions, selection: $challengeCourse, accessibilityLabel: "Course")
            Button("Send challenge") { Task { await challengeFriend() } }
                .buttonStyle(.dsButton(.primary))
                .disabled(challengeFriendID.isEmpty)
        }
        .dsListRow()
    }

    @ViewBuilder
    private var openDuelSection: some View {
        DSOverline("Open duel").dsListRow()
        DSCard {
            Text("Get matched with another learner at your level.")
                .dsText(.footnote).foregroundStyle(ds.inkSoft)
            DSSegmented(options: courseOptions, selection: $openCourse, accessibilityLabel: "Course")
            Toggle(isOn: $matchByLevel) {
                Text("Match me with someone at my level").dsText(.headline).foregroundStyle(ds.ink)
            }
            .tint(ds.choice)
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            if waitingInQueue {
                HStack(spacing: AlphonsoDS.Space.s3) {
                    Text("Waiting for an opponent…").dsText(.footnote).foregroundStyle(ds.inkSoft)
                    Spacer(minLength: AlphonsoDS.Space.s2)
                    Button("Cancel") { Task { await leaveQueue() } }
                        .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                }
            } else {
                Button(queueing ? "Finding a match…" : "Find an open duel") {
                    Task { await joinQueue() }
                }
                .buttonStyle(.dsButton(.primary))
                .disabled(queueing)
            }
        }
        .dsListRow()
    }

    @ViewBuilder
    private var pastDuelsSection: some View {
        DSOverline("Past duels").dsListRow()
        DSCard(padding: AlphonsoDS.Space.s4, spacing: 0) {
            ForEach(Array(finished.enumerated()), id: \.element.id) { index, d in
                let result = DuelsPresentation.result(status: d.status, winnerID: d.winnerID, myID: myID)
                if index > 0 { Divider().overlay(ds.line) }
                HStack(spacing: AlphonsoDS.Space.s3) {
                    Text(d.course).dsText(.headline).foregroundStyle(ds.ink)
                    Spacer(minLength: AlphonsoDS.Space.s2)
                    DSPill(text: result.label, tone: pillTone(result.tone))
                }
                .frame(minHeight: AlphonsoDS.Space.minTouch)
                .accessibilityElement(children: .combine)
            }
        }
        .dsListRow()
    }

    private func pillTone(_ tone: DuelsPresentation.ResultTone) -> DSPill.Tone {
        switch tone {
        case .won: return .good
        case .lost: return .bad
        case .tied, .declined: return .neutral
        }
    }

    private var client: ProgressSyncClient? {
        guard let accessToken = session.accessToken else { return nil }
        return ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
    }

    private func loadAll() async {
        guard let client else { isLoading = false; return }
        isLoading = true
        defer { isLoading = false }
        do {
            duels = try await client.fetchMyDuels()
            friends = try await client.fetchFriendsProgress()
        } catch {
            if !Task.isCancelled { errorMessage = SocialReasonCopy.failureMessage(for: error) }
        }
    }

    private func respond(_ d: Duel, accept: Bool) async {
        guard let client else { return }
        errorMessage = nil
        do {
            let result = try await client.respondToDuel(duelID: d.duelID, accept: accept)
            if result.ok { await loadAll() } else { errorMessage = SocialReasonCopy.message(for: result.reason ?? "unknown-error") }
        } catch {
            errorMessage = SocialReasonCopy.failureMessage(for: error)
        }
    }

    private func challengeFriend() async {
        guard let client, !challengeFriendID.isEmpty else { return }
        errorMessage = nil
        do {
            let result = try await client.createDuel(opponentID: challengeFriendID, course: challengeCourse.rawValue)
            if result.ok {
                challengeFriendID = ""
                await loadAll()
            } else {
                errorMessage = SocialReasonCopy.message(for: result.reason ?? "unknown-error")
            }
        } catch {
            errorMessage = SocialReasonCopy.failureMessage(for: error)
        }
    }

    private func joinQueue() async {
        guard let client else { return }
        queueing = true
        errorMessage = nil
        defer { queueing = false }
        do {
            let result = try await client.joinOpenDuelQueue(course: openCourse.rawValue, matchByLevel: matchByLevel)
            if result.matched {
                waitingInQueue = false
                await loadAll()
            } else {
                waitingInQueue = true
            }
        } catch {
            errorMessage = SocialReasonCopy.failureMessage(for: error)
        }
    }

    private func leaveQueue() async {
        guard let client else { return }
        do {
            try await client.leaveOpenDuelQueue()
            waitingInQueue = false
        } catch {
            errorMessage = SocialReasonCopy.failureMessage(for: error)
        }
    }
}
