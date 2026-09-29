import SwiftUI
import LearnWithAlphonsoKit

/// V4 candidate #7 (deeper gamification) -- linked from LeaderboardView,
/// not its own tab -- the app already has 7 bottom tabs (see
/// RootView.swift), an 8th would overcrowd the bar. Web mirrors this by
/// linking Teams from /league rather than giving it primary nav too.
struct TeamsView: View {
    let session: Session

    @State private var myTeam: MyTeam?
    @State private var members: [TeamMember] = []
    @State private var leaderboard: [TeamLeaderboardRow] = []
    @State private var code = ""
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var newTeamName = ""
    @State private var newTeamVisibility = "public"
    @State private var showingShareSheet = false

    var body: some View {
        List {
            if let myTeam {
                Section {
                    // TestFlight feedback (2026-09-29): "how can a team
                    // invite a player, how can they share a code" -- the
                    // code was only ever displayed as plain text, with no
                    // way to actually send it to anyone. A native share
                    // sheet covers copy/Messages/AirDrop/etc. in one control.
                    HStack {
                        Text("Join code: \(myTeam.joinCode)")
                            .font(AlphonsoFont.sans(14))
                            .foregroundStyle(AlphonsoColor.ink)
                        Spacer()
                        ShareLink(item: "Join my team \"\(myTeam.name)\" on Learn with Alphonso! Enter code \(myTeam.joinCode) under Teams \u{2192} Join a team.") {
                            Image(systemName: "square.and.arrow.up")
                        }
                        .tint(AlphonsoColor.moss)
                    }
                    Text("\(myTeam.thisWeekXP) XP this week")
                        .font(AlphonsoFont.display(17, weight: .semiBold))
                        .foregroundStyle(AlphonsoColor.ink)
                    if myTeam.switchLockedUntil > Date() {
                        Text("Can't leave until \(myTeam.switchLockedUntil.formatted(date: .abbreviated, time: .omitted))")
                            .font(AlphonsoFont.sans(12))
                            .foregroundStyle(AlphonsoColor.inkSoft)
                    } else {
                        Button("Leave team", role: .destructive) { Task { await leave() } }
                            .tint(AlphonsoColor.destructive)
                    }
                } header: {
                    Text(myTeam.name)
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
                }
                .listRowBackground(AlphonsoColor.parchment)

                // TestFlight feedback (2026-09-29): "does the team owner
                // have any authority?" -- previously no, and there wasn't
                // even a member list to see who's on the team at all.
                Section {
                    ForEach(members) { member in
                        HStack {
                            Text(member.displayName)
                                .font(AlphonsoFont.sans(15))
                                .foregroundStyle(AlphonsoColor.ink)
                            if member.isOwner {
                                Text("Owner")
                                    .font(AlphonsoFont.sans(11, weight: .semiBold))
                                    .foregroundStyle(AlphonsoColor.ember)
                            }
                            Spacer()
                            if myTeam.isOwner && !member.isOwner {
                                Button(role: .destructive) {
                                    Task { await kick(member) }
                                } label: {
                                    Image(systemName: "person.fill.xmark")
                                }
                                .tint(AlphonsoColor.destructive)
                            }
                        }
                    }
                } header: {
                    Text("Members")
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
                }
                .listRowBackground(AlphonsoColor.parchment)
            } else {
                Section {
                    TextField("Join code", text: $code)
                        .font(AlphonsoFont.sans(15))
                    Button("Join by code") { Task { await joinByCode() } }
                        .tint(AlphonsoColor.moss)
                    Button("Put me on a team") { Task { await autoJoin() } }
                        .tint(AlphonsoColor.moss)
                } header: {
                    Text("Join a team")
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
                }
                .listRowBackground(AlphonsoColor.parchment)

                Section {
                    TextField("Team name", text: $newTeamName)
                        .font(AlphonsoFont.sans(15))
                    Picker("Visibility", selection: $newTeamVisibility) {
                        Text("Public").tag("public")
                        Text("Private").tag("private")
                    }
                    .pickerStyle(.segmented)
                    Button("Create team") { Task { await createTeam() } }
                        .tint(AlphonsoColor.moss)
                        .disabled(newTeamName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } header: {
                    Text("Create a team")
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
                }
                .listRowBackground(AlphonsoColor.parchment)
            }

            Section {
                if isLoading {
                    ProgressView().tint(AlphonsoColor.moss)
                } else {
                    ForEach(Array(leaderboard.enumerated()), id: \.element.teamID) { i, team in
                        AlphonsoRowCard(title: "\(i + 1). \(team.name)", subtitle: "\(team.weeklyXP) XP this week")
                    }
                }
            } header: {
                Text("This week's top teams")
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .tracking(0.4)
                    .foregroundStyle(AlphonsoColor.ember)
            }
            .listRowBackground(Color.clear)

            if let errorMessage {
                Text(errorMessage).font(AlphonsoFont.sans(13)).foregroundStyle(AlphonsoColor.inkSoft)
            }
        }
        .scrollContentBackground(.hidden)
        .background(AlphonsoColor.surface)
        .navigationTitle("Teams")
        .tint(AlphonsoColor.moss)
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
        members = myTeam != nil ? ((try? await client.getTeamMembers()) ?? []) : []
        leaderboard = (try? await client.getTeamLeaderboard()) ?? []
        isLoading = false
    }

    private func kick(_ member: TeamMember) async {
        guard let client else { return }
        errorMessage = nil
        let result = try? await client.kickTeamMember(userID: member.userID)
        if result?.ok == true { await loadAll() } else { errorMessage = result?.reason }
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

    private func createTeam() async {
        guard let client else { return }
        errorMessage = nil
        let name = newTeamName.trimmingCharacters(in: .whitespacesAndNewlines)
        let result = try? await client.createTeam(name: name, visibility: newTeamVisibility)
        if result?.ok == true {
            newTeamName = ""
            await loadAll()
        } else {
            errorMessage = result?.reason
        }
    }

    private func leave() async {
        guard let client else { return }
        errorMessage = nil
        let result = try? await client.leaveTeam()
        if result?.ok == true { await loadAll() } else { errorMessage = result?.reason }
    }
}
