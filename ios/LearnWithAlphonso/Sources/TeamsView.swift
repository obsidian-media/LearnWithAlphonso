import SwiftUI
import LearnWithAlphonsoKit

/// V4 candidate #7 (deeper gamification) -- linked from LeaderboardView,
/// not its own tab -- the app already has 7 bottom tabs (see
/// RootView.swift), an 8th would overcrowd the bar. Web mirrors this by
/// linking Teams from /league rather than giving it primary nav too.
struct TeamsView: View {
    let session: Session

    @State private var myTeam: MyTeam?
    // Owned here, not by the mission section: an empty section in a List produces no row, so it could never load itself.
    @StateObject private var missionModel = TeamMissionModel()
    @State private var members: [TeamMember] = []
    @State private var leaderboard: [TeamLeaderboardRow] = []
    @State private var code = ""
    @State private var isLoading = true
    // A failed team lookup is not "no team": without this the screen offered to create or join one during an outage.
    @State private var loadFailed = false
    // Latest load wins: an older load finishing late (one started by a kick, then Leave) must not put back a left team.
    @State private var loadGeneration = 0
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
    /// The member the owner tapped to remove, awaiting confirmation.
    @State private var kickTarget: TeamMember?

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
                        .accessibilityLabel("Share team invite")
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

                TeamMissionSection(mission: missionModel.mission)

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
                            if member.isBlocked {
                                // Only the owner's list contains blocked members; shown so they can be removed.
                                Text("Blocked")
                                    .font(AlphonsoFont.sans(11, weight: .semiBold))
                                    .foregroundStyle(AlphonsoColor.destructive)
                            }
                            Spacer()
                            if myTeam.isOwner && !member.isOwner {
                                Button(role: .destructive) {
                                    kickTarget = member
                                } label: {
                                    Image(systemName: "person.fill.xmark")
                                }
                                .tint(AlphonsoColor.destructive)
                                // Two buttons in one List row: without an
                                // explicit style, a tap anywhere on the row
                                // fires both.
                                .buttonStyle(.borderless)
                                .accessibilityLabel(TeamKickCopy.buttonLabel(memberName: member.displayName))
                            }
                            if member.userID != session.userID && !member.isBlocked {
                                SocialSafetyMenu(
                                    onBlock: { blockTarget = SocialTarget(id: member.userID, displayName: member.displayName) },
                                    onReport: { reportTarget = SocialTarget(id: member.userID, displayName: member.displayName) },
                                    accessibilityName: member.displayName
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
            } else if loadFailed {
                Section {
                    Text("Couldn't load your team.")
                        .font(AlphonsoFont.sans(15))
                        .foregroundStyle(AlphonsoColor.ink)
                    Button("Try again") { Task { await loadAll() } }
                        .tint(AlphonsoColor.moss)
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
        // On the always-present List. Reloads when the member count changes: an owner kicking someone turns a
        // two-person mission into "invite a friend" on the server, and the card must follow.
        .task(id: "\(myTeam?.joinCode ?? "")-\(members.count)") { await missionModel.load(session: session) }
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
        .confirmationDialog(
            TeamKickCopy.title(memberName: kickTarget?.displayName ?? "this member"),
            isPresented: Binding(
                get: { kickTarget != nil },
                set: { if !$0 { kickTarget = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(TeamKickCopy.confirm, role: .destructive) {
                if let member = kickTarget {
                    Task { await kick(member) }
                }
                kickTarget = nil
            }
            Button("Cancel", role: .cancel) { kickTarget = nil }
        } message: {
            Text(TeamKickCopy.message)
        }
        .sheet(item: $reportTarget) { target in
            ReportSheet(target: target, session: session)
        }
    }

    /// Blocking hides the person from a member's team list; the owner still sees them, marked Blocked, to remove them.
    private func block(_ target: SocialTarget) async {
        guard let client else { errorMessage = SocialReasonCopy.message(for: "unauthenticated"); return }
        errorMessage = nil
        do {
            let result = try await client.blockUser(target.id)
            if result.ok {
                BlockedUserSignal.post(userID: target.id)
                await loadAll()
                errorMessage = SocialReasonCopy.teamBlockedLine(target.displayName, viewerIsOwner: myTeam?.isOwner == true)
            } else {
                errorMessage = "Couldn't block \(target.displayName). Try again."
            }
        } catch {
            errorMessage = SocialReasonCopy.failureMessage(for: error)
        }
    }

    private var client: ProgressSyncClient? {
        guard let accessToken = session.accessToken else { return nil }
        return ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
    }

    private func loadAll() async {
        guard let client else { return }
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        var team = myTeam
        var failed = loadFailed
        var lookupSucceeded = false
        var partialError: Error?
        do {
            team = try await client.getMyTeam()
            failed = false
            lookupSucceeded = true
        } catch {
            // A cancelled load (the view went away or reloaded) is not a failure; a failed refresh keeps the loaded team.
            if !Task.isCancelled { failed = team == nil }
        }
        var newMembers = members // kept when the lookup or the member read fails
        if lookupSucceeded {
            if team == nil {
                newMembers = []
            } else {
                do { newMembers = try await client.getTeamMembers() } catch { partialError = error }
            }
        }
        var board = leaderboard
        do { board = try await client.getTeamLeaderboard() } catch { partialError = error }
        guard generation == loadGeneration else { return }
        myTeam = team
        loadFailed = failed
        members = newMembers
        leaderboard = board
        isLoading = false
        if let partialError, !Task.isCancelled { errorMessage = SocialReasonCopy.failureMessage(for: partialError) }
    }

    /// One team RPC: a refusal shows the server's reason in words, a thrown error shows what actually failed.
    private func perform(_ action: (ProgressSyncClient) async throws -> (ok: Bool, reason: String?)) async -> (ok: Bool, reason: String?)? {
        guard let client else { errorMessage = SocialReasonCopy.message(for: "unauthenticated"); return nil }
        errorMessage = nil
        do {
            let result = try await action(client)
            if !result.ok { errorMessage = SocialReasonCopy.message(for: result.reason ?? "unknown-error") }
            return result
        } catch {
            errorMessage = SocialReasonCopy.failureMessage(for: error)
            return nil
        }
    }

    private func kick(_ member: TeamMember) async {
        guard await perform({ try await $0.kickTeamMember(userID: member.userID) })?.ok == true else { return }
        // Drop them now: if the reload fails, the kept member list would still show the removed member.
        members.removeAll { $0.userID == member.userID }
        await loadAll()
    }

    private func joinByCode() async {
        guard await perform({ let r = try await $0.joinTeamByCode(code); return (r.ok, r.reason) })?.ok == true else { return }
        await loadAll()
    }

    private func autoJoin() async {
        guard await perform({ let r = try await $0.autoJoinTeam(); return (r.ok, r.reason) })?.ok == true else { return }
        await loadAll()
    }

    private func createTeam() async {
        let name = newTeamName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard await perform({ let r = try await $0.createTeam(name: name, visibility: newTeamVisibility); return (r.ok, r.reason) })?.ok == true
        else { return }
        newTeamName = ""
        await loadAll()
    }

    private func leave() async {
        guard let result = await perform({ try await $0.leaveTeam() }), result.ok else { return }
        // Clear first: if the reload below fails, a kept stale team would show the team the user just left.
        myTeam = nil
        members = []
        await loadAll()
        // ownership-transferred / team-disbanded are successes that still need saying.
        if let reason = result.reason { errorMessage = SocialReasonCopy.message(for: reason) }
    }
}
