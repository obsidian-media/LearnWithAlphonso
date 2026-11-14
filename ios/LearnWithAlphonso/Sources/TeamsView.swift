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

    @Environment(\.alphonsoDS) private var ds
    @FocusState private var codeFocused: Bool
    @FocusState private var nameFocused: Bool

    private var visibilityOptions: [DSSegmented<String>.Option] {
        [.init(value: "public", label: "Public"), .init(value: "private", label: "Private")]
    }

    var body: some View {
        // The loaders are on this always-present List; each card below may draw nothing.
        List {
            if let myTeam {
                teamHero(myTeam)
                    .dsListRow(top: AlphonsoDS.Space.s2)

                TeamMissionSection(mission: missionModel.mission)

                // TestFlight feedback (2026-09-29): "does the team owner
                // have any authority?" -- previously no, and there wasn't
                // even a member list to see who's on the team at all.
                DSOverline("Members").dsListRow(bottom: AlphonsoDS.Space.s2)
                DSCard(padding: AlphonsoDS.Space.s3, spacing: 0) {
                    ForEach(Array(members.enumerated()), id: \.element.id) { index, member in
                        if index > 0 { Divider().overlay(ds.line) }
                        memberRow(member, in: myTeam)
                    }
                }
                .dsListRow()
            } else if loadFailed {
                DSGlassTitle(title: "Teams")
                    .dsListRow(top: AlphonsoDS.Space.s2)
                DSCard {
                    Text("Couldn't load your team.")
                        .dsText(.body)
                        .foregroundStyle(ds.ink)
                    Button("Try again") { Task { await loadAll() } }
                        .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                }
                .dsListRow()
            } else {
                DSGlassTitle(title: "Teams")
                    .dsListRow(top: AlphonsoDS.Space.s2)
                DSOverline("Join a team").dsListRow(bottom: AlphonsoDS.Space.s2)
                DSCard {
                    TextField("Join code", text: $code)
                        .focused($codeFocused)
                        .dsField(focused: codeFocused)
                    Button("Join by code") { Task { await joinByCode() } }
                        .buttonStyle(.dsButton(.primary))
                        .disabled(!TeamsPresentation.canJoin(code: code))
                    Button("Put me on a team") { Task { await autoJoin() } }
                        .buttonStyle(.dsButton(.secondary))
                }
                .dsListRow()

                DSOverline("Create a team").dsListRow(bottom: AlphonsoDS.Space.s2)
                DSCard {
                    TextField("Team name", text: $newTeamName)
                        .focused($nameFocused)
                        .dsField(focused: nameFocused)
                    DSSegmented(options: visibilityOptions, selection: $newTeamVisibility, accessibilityLabel: "Visibility")
                    Button("Create team") { Task { await createTeam() } }
                        .buttonStyle(.dsButton(.primary))
                        .disabled(!TeamsPresentation.canCreate(name: newTeamName))
                }
                .dsListRow()
            }

            if isLoading || !leaderboard.isEmpty {
                DSOverline("This week's top teams").dsListRow(bottom: AlphonsoDS.Space.s2)
                if isLoading {
                    DSCard { ProgressView().tint(ds.choice).frame(maxWidth: .infinity) }
                        .dsListRow()
                } else {
                    DSCard(padding: AlphonsoDS.Space.s2, spacing: 0) {
                        ForEach(Array(leaderboard.enumerated()), id: \.element.teamID) { i, team in
                            topTeamRow(rank: i + 1, team: team)
                        }
                    }
                    .dsListRow()
                }
            }

            if let myTeam, myTeam.switchLockedUntil <= Date() {
                Button("Leave team", role: .destructive) { Task { await leave() } }
                    .buttonStyle(.dsButton(.danger, compact: true, fullWidth: false))
                    .frame(maxWidth: .infinity)
                    .dsListRow()
            }

            if let errorMessage {
                DSCard { Text(errorMessage).dsText(.footnote).foregroundStyle(ds.inkSoft) }
                    .dsListRow()
            }
        }
        .dsSceneList(.profile)
        .navigationTitle("Teams")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadAll() }
        // On the always-present List. Reloads when the member count changes: an owner kicking someone turns a
        // two-person mission into "invite a friend" on the server, and the card must follow.
        .task(id: "\(myTeam?.joinCode ?? "")-\(members.count)") { await missionModel.load(session: session) }
        .alphonsoChoiceDialog(
            "Block \(blockTarget?.displayName ?? "this user")?",
            isPresented: Binding(
                get: { blockTarget != nil },
                set: { if !$0 { blockTarget = nil } }
            ),
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
        .alphonsoChoiceDialog(
            TeamKickCopy.title(memberName: kickTarget?.displayName ?? "this member"),
            isPresented: Binding(
                get: { kickTarget != nil },
                set: { if !$0 { kickTarget = nil } }
            ),
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

    /// The team: its name, its XP this week, the join code to share, and when leaving unlocks.
    private func teamHero(_ myTeam: MyTeam) -> some View {
        DSHeroCard(spacing: AlphonsoDS.Space.s2) {
            Text("Your team").dsText(.overline).foregroundStyle(ds.onHeroKick)
            Text(myTeam.name).dsText(.display)
                .accessibilityAddTraits(.isHeader)
            Text("\(myTeam.thisWeekXP) XP this week")
                .dsText(.headline)
                .foregroundStyle(ds.onHeroKick)
            // TestFlight feedback (2026-09-29): "how can a team
            // invite a player, how can they share a code" -- the
            // code was only ever displayed as plain text, with no
            // way to actually send it to anyone. A native share
            // sheet covers copy/Messages/AirDrop/etc. in one control.
            HStack(spacing: AlphonsoDS.Space.s3) {
                Text("Join code: \(myTeam.joinCode)")
                    .dsText(.footnote)
                    .padding(.horizontal, AlphonsoDS.Space.s3)
                    .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.onHero.opacity(0.14)))
                ShareLink(item: "Join my team \"\(myTeam.name)\" on Learn with Alphonso! Enter code \(myTeam.joinCode) under Teams \u{2192} Join a team.") {
                    Image(systemName: "square.and.arrow.up")
                        .foregroundStyle(ds.onAction)
                        .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                        .background(Circle().fill(ds.action))
                }
                .accessibilityLabel("Share team invite")
            }
            if myTeam.switchLockedUntil > Date() {
                Text("Can't leave until \(myTeam.switchLockedUntil.formatted(date: .abbreviated, time: .omitted))")
                    .dsText(.caption)
                    .foregroundStyle(ds.onHeroSoft)
            }
        }
    }

    private func memberRow(_ member: TeamMember, in myTeam: MyTeam) -> some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            ProfileAvatarView(seed: member.avatarSeed, name: member.displayName, size: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s2)
            Text(member.displayName)
                .dsText(.headline)
                .foregroundStyle(ds.ink)
                .lineLimit(2)
            if member.isOwner {
                DSPill(text: "Owner", tone: .gold)
            }
            if member.isBlocked {
                // Only the owner's list contains blocked members; shown so they can be removed.
                DSPill(text: "Blocked", tone: .bad)
            }
            Spacer(minLength: AlphonsoDS.Space.s2)
            if myTeam.isOwner && !member.isOwner {
                Button(role: .destructive) {
                    kickTarget = member
                } label: {
                    Image(systemName: "person.fill.xmark")
                }
                .buttonStyle(.dsButton(.danger, compact: true, fullWidth: false))
                .accessibilityLabel(TeamKickCopy.buttonLabel(memberName: member.displayName))
            }
            if member.userID != session.userID && !member.isBlocked {
                SocialSafetyMenu(
                    onBlock: { blockTarget = SocialTarget(id: member.userID, displayName: member.displayName) },
                    onReport: { reportTarget = SocialTarget(id: member.userID, displayName: member.displayName) },
                    accessibilityName: member.displayName
                )
            }
        }
        .frame(minHeight: AlphonsoDS.Space.minTouch)
        .padding(.vertical, AlphonsoDS.Space.s2)
    }

    private func topTeamRow(rank: Int, team: TeamLeaderboardRow) -> some View {
        let mine = team.teamID == myTeam?.teamID
        return HStack(spacing: AlphonsoDS.Space.s3) {
            DSRankBadge(rank: rank)
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1 / 2) {
                Text(team.name).dsText(.headline).foregroundStyle(ds.ink)
                Text("\(team.weeklyXP) XP this week").dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: AlphonsoDS.Space.s2)
            // Hidden only on the team you own (you can't
            // report yourself); members can report their
            // own team's name.
            if !(mine && myTeam?.isOwner == true) {
                Menu {
                    Button {
                        reportTarget = SocialTarget(id: team.teamID, displayName: team.name, isTeamName: true)
                    } label: {
                        Label("Report Team Name", systemImage: "flag")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundStyle(ds.inkSoft)
                        .frame(minWidth: AlphonsoDS.Space.minTouch, minHeight: AlphonsoDS.Space.minTouch)
                }
                .accessibilityLabel("More options for \(team.name)")
            }
        }
        .padding(.horizontal, AlphonsoDS.Space.s2)
        .padding(.vertical, AlphonsoDS.Space.s1)
        .frame(minHeight: AlphonsoDS.Space.minTouch)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(mine ? ds.choiceTint : Color.clear))
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
