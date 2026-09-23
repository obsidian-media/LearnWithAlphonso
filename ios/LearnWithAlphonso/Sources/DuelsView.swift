import SwiftUI
import LearnWithAlphonsoKit

/// V4 candidate #7 (deeper gamification) -- this codebase had zero
/// duel UI anywhere (web or iOS) despite createDuel/respondToDuel/
/// fetchMyDuels already being fully built, so this covers both the
/// pre-existing friend-duel flow and the new open-duel queue in one
/// view. Linked from FriendsView, not its own tab -- same
/// no-room-for-another-tab reasoning as TeamsView/SeasonView.
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

    private var myID: String? { session.userID }
    private var pending: [Duel] { duels.filter { $0.status == "pending" && $0.opponentID == myID } }
    private var active: [Duel] { duels.filter { $0.status == "active" } }
    private var finished: [Duel] { duels.filter { $0.status == "completed" || $0.status == "declined" } }

    var body: some View {
        List {
            if let errorMessage {
                Text(errorMessage).font(AlphonsoFont.sans(13)).foregroundStyle(AlphonsoColor.destructive)
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
        .scrollContentBackground(.hidden)
        .background(AlphonsoColor.surface)
        .navigationTitle("Duels")
        .tint(AlphonsoColor.moss)
        .task { await loadAll() }
    }

    private var sectionHeaderFont: Font { AlphonsoFont.sans(12, weight: .semiBold) }

    private var pendingSection: some View {
        let content = ForEach(pending) { d in
            HStack {
                Text("Challenge (\(d.course))")
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.ink)
                Spacer()
                Button("Accept") { Task { await respond(d, accept: true) } }
                    .buttonStyle(.alphonsoPrimary(fullWidth: false))
                Button("Decline") { Task { await respond(d, accept: false) } }
                    .buttonStyle(.alphonsoSecondary(fullWidth: false))
            }
        }
        return Section {
            content
        } header: {
            Text("Pending challenges")
                .font(sectionHeaderFont)
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
        }
        .listRowBackground(AlphonsoColor.parchment)
    }

    private var activeSection: some View {
        Section {
            if isLoading {
                ProgressView().tint(AlphonsoColor.moss)
            } else if active.isEmpty {
                Text("No active duels right now.").font(AlphonsoFont.sans(13)).foregroundStyle(AlphonsoColor.inkSoft)
            } else {
                ForEach(active) { d in
                    let myXPNow = d.challengerID == myID ? d.challengerXPNow : d.opponentXPNow
                    let myXPStart = d.challengerID == myID ? d.challengerXPStart : d.opponentXPStart
                    let oppXPNow = d.challengerID == myID ? d.opponentXPNow : d.challengerXPNow
                    let oppXPStart = d.challengerID == myID ? d.opponentXPStart : d.challengerXPStart
                    VStack(alignment: .leading) {
                        Text(d.course).font(AlphonsoFont.sans(11)).foregroundStyle(AlphonsoColor.inkSoft)
                        HStack {
                            Text("You: +\(myXPNow - myXPStart)")
                                .font(AlphonsoFont.sans(15, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.ink)
                            Spacer()
                            Text("Them: +\(oppXPNow - oppXPStart)")
                                .font(AlphonsoFont.sans(13))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                        }
                    }
                }
            }
        } header: {
            Text("Active duels")
                .font(sectionHeaderFont)
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
        }
        .listRowBackground(AlphonsoColor.parchment)
    }

    private var challengeFriendSection: some View {
        Section {
            Picker("Friend", selection: $challengeFriendID) {
                Text("Choose a friend…").tag("")
                ForEach(friends, id: \.userID) { f in
                    Text(f.displayName).tag(f.userID)
                }
            }
            Picker("Course", selection: $challengeCourse) {
                ForEach(CourseOption.allCases, id: \.self) { c in
                    Text(c.label).tag(c)
                }
            }
            Button("Send challenge") { Task { await challengeFriend() } }
                .buttonStyle(.alphonsoSecondary(fullWidth: false))
                .disabled(challengeFriendID.isEmpty)
        } header: {
            Text("Challenge a friend")
                .font(sectionHeaderFont)
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
        }
        .listRowBackground(AlphonsoColor.parchment)
    }

    private var openDuelSection: some View {
        Section {
            Text("Get matched with another learner at your level.")
                .font(AlphonsoFont.sans(12))
                .foregroundStyle(AlphonsoColor.inkSoft)
            Picker("Course", selection: $openCourse) {
                ForEach(CourseOption.allCases, id: \.self) { c in
                    Text(c.label).tag(c)
                }
            }
            Toggle("Match me with someone at my level", isOn: $matchByLevel)
                .tint(AlphonsoColor.moss)
            if waitingInQueue {
                HStack {
                    Text("Waiting for an opponent…").font(AlphonsoFont.sans(13)).foregroundStyle(AlphonsoColor.inkSoft)
                    Spacer()
                    Button("Cancel") { Task { await leaveQueue() } }
                        .buttonStyle(.alphonsoSecondary(fullWidth: false))
                }
            } else {
                Button(queueing ? "Finding a match…" : "Find an open duel") {
                    Task { await joinQueue() }
                }
                .buttonStyle(.alphonsoPrimary)
                .disabled(queueing)
            }
        } header: {
            Text("Open duel")
                .font(sectionHeaderFont)
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
        }
        .listRowBackground(AlphonsoColor.parchment)
    }

    private var pastDuelsSection: some View {
        let content = ForEach(finished) { d in
            AlphonsoRowCard(title: d.course, subtitle: resultLabel(d))
        }
        return Section {
            content
        } header: {
            Text("Past duels")
                .font(sectionHeaderFont)
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
        }
        .listRowBackground(Color.clear)
    }

    private func resultLabel(_ d: Duel) -> String {
        if d.status == "declined" { return "Declined" }
        if d.winnerID == myID { return "You won" }
        if d.winnerID != nil { return "You lost" }
        return "Tied"
    }

    private var client: ProgressSyncClient? {
        guard let accessToken = session.accessToken else { return nil }
        return ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
    }

    private func loadAll() async {
        guard let client else { isLoading = false; return }
        isLoading = true
        duels = (try? await client.fetchMyDuels()) ?? []
        friends = (try? await client.fetchFriendsProgress()) ?? []
        isLoading = false
    }

    private func respond(_ d: Duel, accept: Bool) async {
        guard let client else { return }
        errorMessage = nil
        do {
            let result = try await client.respondToDuel(duelID: d.duelID, accept: accept)
            if result.ok { await loadAll() } else { errorMessage = result.reason }
        } catch {
            errorMessage = "Check your connection and try again."
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
                errorMessage = result.reason
            }
        } catch {
            errorMessage = "Check your connection and try again."
        }
    }

    private func joinQueue() async {
        guard let client else { return }
        queueing = true
        errorMessage = nil
        do {
            let result = try await client.joinOpenDuelQueue(course: openCourse.rawValue, matchByLevel: matchByLevel)
            queueing = false
            if result.matched {
                waitingInQueue = false
                await loadAll()
            } else {
                waitingInQueue = true
            }
        } catch {
            queueing = false
            errorMessage = "Check your connection and try again."
        }
    }

    private func leaveQueue() async {
        guard let client else { return }
        try? await client.leaveOpenDuelQueue()
        waitingInQueue = false
    }
}
