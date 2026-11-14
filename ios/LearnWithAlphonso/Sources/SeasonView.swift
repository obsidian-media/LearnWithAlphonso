import SwiftUI
import LearnWithAlphonsoKit

/// Linked from LeaderboardView, same reasoning as TeamsView -- no room
/// for a 9th bottom tab.
struct SeasonView: View {
    let session: Session

    @State private var status: SeasonStatus?
    @State private var isLoading = true
    @State private var reloadToken = 0
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        List {
            if isLoading {
                DSCard { ProgressView().tint(ds.choice).frame(maxWidth: .infinity) }
                    .dsListRow(top: AlphonsoDS.Space.s2)
            } else if let status {
                DSHeroCard {
                    Text("Division \(status.division)").dsText(.displayXL).foregroundStyle(ds.onHero)
                    Text("Rank \(status.rankInCohort) of \(status.cohortSize) this week")
                        .dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                }
                .dsListRow(top: AlphonsoDS.Space.s2)
                if let lastWeek = status.lastWeekResult {
                    DSOverline("Last week").dsListRow(bottom: AlphonsoDS.Space.s2)
                    DSCard {
                        Text("Division \(lastWeek.division), rank \(lastWeek.rankInCohort) of \(lastWeek.cohortSize)")
                            .dsText(.headline).foregroundStyle(ds.ink)
                    }
                    .dsListRow()
                }
            } else {
                DSEmptyState(
                    emoji: "\u{1F6E1}", title: "Couldn't load your season status.",
                    actionTitle: "Try again", action: { reloadToken += 1 })
                    .dsListRow(top: AlphonsoDS.Space.s2)
            }
        }
        .dsSceneList(.profile)
        .navigationTitle("Season")
        .task(id: reloadToken) {
            isLoading = true
            guard let accessToken = session.accessToken else { isLoading = false; return }
            let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
            status = try? await client.getSeasonStatus()
            isLoading = false
        }
    }
}
