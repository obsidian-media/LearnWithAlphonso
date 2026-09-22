import SwiftUI
import LearnWithAlphonsoKit

/// V4 candidate #7 (deeper gamification) -- linked from LeaderboardView,
/// not its own tab -- the app already has 7 bottom tabs (see
/// RootView.swift), an 8th would overcrowd the bar. Web mirrors this by
/// linking Teams from /league rather than giving it primary nav too.
struct TeamsView: View {
    let session: Session

    @State private var myTeam: MyTeam?
    @State private var leaderboard: [TeamLeaderboardRow] = []
    @State private var code = ""
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List {
            if let myTeam {
                Section(myTeam.name) {
                    Text("Join code: \(myTeam.joinCode)")
                    Text("\(myTeam.thisWeekXP) XP this week").font(.headline)
                    if myTeam.switchLockedUntil > Date() {
                        Text("Can't leave until \(myTeam.switchLockedUntil.formatted(date: .abbreviated, time: .omitted))")
                            .foregroundStyle(.secondary)
                    } else {
                        Button("Leave team", role: .destructive) { Task { await leave() } }
                    }
                }
            } else {
                Section("Join a team") {
                    TextField("Join code", text: $code)
                    Button("Join by code") { Task { await joinByCode() } }
                    Button("Put me on a team") { Task { await autoJoin() } }
                }
            }

            Section("This week's top teams") {
                if isLoading {
                    ProgressView()
                } else {
                    ForEach(Array(leaderboard.enumerated()), id: \.element.teamID) { i, team in
                        HStack {
                            Text("\(i + 1). \(team.name)")
                            Spacer()
                            Text("\(team.weeklyXP) XP").foregroundStyle(.secondary)
                        }
                    }
                }
            }

            if let errorMessage {
                Text(errorMessage).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Teams")
        .task { await loadAll() }
    }

    private var client: ProgressSyncClient? {
        guard let accessToken = session.accessToken else { return nil }
        return ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
    }

    private func loadAll() async {
        guard let client else { return }
        isLoading = true
        myTeam = try? await client.getMyTeam()
        leaderboard = (try? await client.getTeamLeaderboard()) ?? []
        isLoading = false
    }

    private func joinByCode() async {
        guard let client else { return }
        errorMessage = nil
        let result = try? await client.joinTeamByCode(code)
        if result?.ok == true { await loadAll() } else { errorMessage = result?.reason }
    }

    private func autoJoin() async {
        guard let client else { return }
        errorMessage = nil
        let result = try? await client.autoJoinTeam()
        if result?.ok == true { await loadAll() } else { errorMessage = result?.reason }
    }

    private func leave() async {
        guard let client else { return }
        errorMessage = nil
        let result = try? await client.leaveTeam()
        if result?.ok == true { await loadAll() } else { errorMessage = result?.reason }
    }
}
