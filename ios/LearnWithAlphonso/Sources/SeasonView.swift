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
                // A skeleton of the card that is coming, not a bare spinner.
                DSCard(spacing: AlphonsoDS.Space.s2) {
                    RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key, style: .continuous).fill(ds.sunk)
                        .frame(height: AlphonsoDS.Space.s8)
                    RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key, style: .continuous).fill(ds.sunk)
                        .frame(width: AlphonsoDS.Space.s12 * 3, height: AlphonsoDS.Space.s4)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Loading your season")
                .dsListRow(top: AlphonsoDS.Space.s2)
            } else if let status {
                HStack(spacing: AlphonsoDS.Space.s2) {
                    Icon3DView(emoji: "\u{1F3C6}", size: AlphonsoDS.Space.s6)
                    DSOverline("This week")
                }
                .dsListRow(top: AlphonsoDS.Space.s2, bottom: AlphonsoDS.Space.s2)
                DSHeroCard {
                    Text("Division \(status.division)").dsText(.displayXL).foregroundStyle(ds.onHero)
                    Text("Rank \(status.rankInCohort) of \(status.cohortSize) this week")
                        .dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                }
                .dsListRow()
                if let lastWeek = status.lastWeekResult {
                    DSOverline("Last week").dsListRow(bottom: AlphonsoDS.Space.s2)
                    DSCard {
                        HStack(spacing: AlphonsoDS.Space.s3) {
                            Icon3DView(emoji: "\u{1F6E1}", size: AlphonsoDS.Space.s8)
                            Text("Division \(lastWeek.division), rank \(lastWeek.rankInCohort) of \(lastWeek.cohortSize)")
                                .dsText(.headline).foregroundStyle(ds.ink)
                        }
                    }
                    .dsListRow()
                }
            } else {
                DSEmptyState(
                    art: "Alphonso-encouraging", title: "Couldn't load your season status.",
                    message: "Check your connection and try again.",
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
