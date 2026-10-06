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
    // Report/block on member rows and report on public team names -- added
    // in the 2026-09-29 pre-submission audit. Teams was the one social
    // surface without them, though the App Review notes say every surface
    // has them (Guideline 1.2). Same shared controls as Friends/Duels/League.
    @State private var reportTarget: SocialTarget?
    @State private var blockTarget: SocialTarget?

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

                TeamMissionSection(session: session, reloadKey: members.count)

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
                                // Two buttons in one List row: without an
                                // explicit style, a tap anywhere on the row
                                // fires both.
                                .buttonStyle(.borderless)
                            }
                            if member.userID != session.userID {
                                SocialSafetyMenu(
                                    onBlock: { blockTarget = SocialTarget(id: member.userID, displayName: member.displayName) },
                                    onReport: { reportTarget = SocialTarget(id: member.userID, displayName: member.displayName) }
                                )
                                .buttonStyle(.borderless)
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
                        HStack {
                            AlphonsoRowCard(title: "\(i + 1). \(team.name)", subtitle: "\(team.weeklyXP) XP this week")
                            // Hidden only on the team you own (you can't
                            // report yourself); members can report their
                            // own team's name.
                            if !(team.teamID == myTeam?.teamID && myTeam?.isOwner == true) {
                                Menu {
                                    Button {
                                        reportTarget = SocialTarget(id: team.teamID, displayName: team.name, isTeamName: true)
                                    } label: {
                                        Label("Report Team Name", systemImage: "flag")
                                    }
                                } label: {
                                    Image(systemName: "ellipsis.circle")
                                        .foregroundStyle(AlphonsoColor.inkSoft)
                                }
                                .accessibilityLabel("More options for \(team.name)")
                            }
                        }
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
        .confirmationDialog(
            "Block \(blockTarget?.displayName ?? "this user")?",
            isPresented: Binding(
                get: { blockTarget != nil },
                set: { if !$0 { blockTarget = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Block", role: .destructive) {
                if let target = blockTarget {
                    Task { await block(target) }
                }
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

    /// Blocking hides the person everywhere else but can't remove them from
    /// a shared team (membership is the owner's call), so this says so
    /// rather than implying they're gone from this list.
    private func block(_ target: SocialTarget) async {
        guard let client else { return }
        errorMessage = nil
        let result = try? await client.blockUser(target.id)
        errorMessage = result?.ok == true
            ? "\(target.displayName) is blocked. They can't friend you or challenge you to a duel. Leave the team if you don't want to share it with them."
            : "Couldn't block \(target.displayName). Try again."
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
