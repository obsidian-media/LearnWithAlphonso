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
                Text(errorMessage).foregroundStyle(.red)
            }

            if !pending.isEmpty {
                Section("Pending challenges") {
                    ForEach(pending) { d in
                        HStack {
                            Text("Challenge (\(d.course))")
                            Spacer()
                            Button("Accept") { Task { await respond(d, accept: true) } }
                                .buttonStyle(.borderedProminent)
                            Button("Decline") { Task { await respond(d, accept: false) } }
                                .buttonStyle(.bordered)
                        }
                    }
                }
            }

            Section("Active duels") {
                if isLoading {
                    ProgressView()
                } else if active.isEmpty {
                    Text("No active duels right now.").foregroundStyle(.secondary)
                } else {
                    ForEach(active) { d in
                        let myXPNow = d.challengerID == myID ? d.challengerXPNow : d.opponentXPNow
                        let myXPStart = d.challengerID == myID ? d.challengerXPStart : d.opponentXPStart
                        let oppXPNow = d.challengerID == myID ? d.opponentXPNow : d.challengerXPNow
                        let oppXPStart = d.challengerID == myID ? d.opponentXPStart : d.challengerXPStart
                        VStack(alignment: .leading) {
                            Text(d.course).font(.caption).foregroundStyle(.secondary)
                            HStack {
                                Text("You: +\(myXPNow - myXPStart)").font(.headline)
                                Spacer()
                                Text("Them: +\(oppXPNow - oppXPStart)").foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Section("Challenge a friend") {
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
                    .disabled(challengeFriendID.isEmpty)
            }

            Section("Open duel") {
                Text("Get matched with another learner at your level.").font(.caption).foregroundStyle(.secondary)
                Picker("Course", selection: $openCourse) {
                    ForEach(CourseOption.allCases, id: \.self) { c in
                        Text(c.label).tag(c)
                    }
                }
                Toggle("Match me with someone at my level", isOn: $matchByLevel)
                if waitingInQueue {
                    HStack {
                        Text("Waiting for an opponent…").foregroundStyle(.secondary)
                        Spacer()
                        Button("Cancel") { Task { await leaveQueue() } }
                    }
                } else {
                    Button(queueing ? "Finding a match…" : "Find an open duel") {
                        Task { await joinQueue() }
                    }
                    .disabled(queueing)
                }
            }

            if !finished.isEmpty {
                Section("Past duels") {
                    ForEach(finished) { d in
                        HStack {
                            Text(d.course)
                            Spacer()
                            Text(resultLabel(d)).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Duels")
        .task { await loadAll() }
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
