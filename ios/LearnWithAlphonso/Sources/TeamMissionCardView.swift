import SwiftUI
import LearnWithAlphonsoKit

/// A team's weekly shared mission, on the team screen and the Learn tab (BACKLOG 0.0-ac #2, docs/superpowers/
/// specs/2026-10-06-study-together-design.md). It renders what the `get_team_mission` RPC returns and does no
/// mission maths of its own: the server computes the target, the progress and the payout, and `TeamMission`
/// (tested in the Kit against the shared fixtures) owns the wording, which is word-for-word the web card's.
/// The section renders nothing while loading, without a team, or when the call fails, so it never disrupts
/// the otherwise-offline content list. It does NOT load anything itself: an empty section inside a `List`
/// produces no row, so a `.task` attached to it never fires and the card could never appear. The screen that
/// hosts it owns a `TeamMissionModel` and runs `load` from a `.task` on the always-present `List`.
/// Holds the mission and loads it. Owned by the host screen (as a `@StateObject`), never by the section.
@MainActor
final class TeamMissionModel: ObservableObject {
    @Published private(set) var mission: TeamMission?

    func load(session: Session) async {
        // The refreshed token, like the goal card: `session.accessToken` is the stored one even when it
        // has expired, which would make this card quietly vanish an hour into a session.
        guard let accessToken = await session.freshAccessToken() else { return }
        let client = ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        // A real failure shows nothing rather than a fabricated empty mission. A CANCELLED load (SwiftUI cancels
        // the running task when its id changes or the view goes away) must leave the card exactly as it was:
        // `try?` would turn the cancellation into nil and hide a card that is already showing.
        let result = try? await client.getTeamMission()
        guard !Task.isCancelled else { return }
        mission = result
    }
}

struct TeamMissionSection: View {
    let mission: TeamMission?

    var body: some View {
        if let mission {
            Section {
                VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                    Text(mission.headline)
                        .font(AlphonsoFont.sans(15, weight: .medium))
                        .foregroundStyle(AlphonsoColor.ink)
                    if mission.status != .needsMembers {
                        AlphonsoProgressBar(progress: Double(mission.percent) / 100)
                            .accessibilityLabel("Team mission progress")
                            .accessibilityValue("\(mission.percent) percent")
                    }
                    if !mission.footer.isEmpty {
                        Text(mission.footer)
                            .font(AlphonsoFont.sans(12))
                            .foregroundStyle(AlphonsoColor.inkSoft)
                    }
                }
                .padding(.vertical, 2)
                .accessibilityElement(children: .combine)
            } header: {
                Text("Team mission")
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .tracking(0.4)
                    .foregroundStyle(AlphonsoColor.ember)
            }
            .listRowBackground(AlphonsoColor.parchment)
        }
    }
}
