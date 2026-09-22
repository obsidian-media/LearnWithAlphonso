import SwiftUI
import LearnWithAlphonsoKit

/// Linked from LeaderboardView, same reasoning as TeamsView -- no room
/// for a 9th bottom tab.
struct SeasonView: View {
    let session: Session

    @State private var status: SeasonStatus?
    @State private var isLoading = true

    var body: some View {
        List {
            if isLoading {
                ProgressView().tint(AlphonsoColor.moss)
            } else if let status {
                Section {
                    Text("Division \(status.division)")
                        .font(AlphonsoFont.display(28, weight: .bold))
                        .foregroundStyle(AlphonsoColor.ink)
                    Text("Rank \(status.rankInCohort) of \(status.cohortSize) this week")
                        .font(AlphonsoFont.sans(13))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
                .listRowBackground(AlphonsoColor.parchment)
                if let lastWeek = status.lastWeekResult {
                    Section {
                        Text("Division \(lastWeek.division), rank \(lastWeek.rankInCohort) of \(lastWeek.cohortSize)")
                            .font(AlphonsoFont.sans(14))
                            .foregroundStyle(AlphonsoColor.ink)
                    } header: {
                        Text("Last week")
                            .font(AlphonsoFont.sans(12, weight: .semiBold))
                            .tracking(0.4)
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                    .listRowBackground(AlphonsoColor.parchment)
                }
            } else {
                Text("Couldn't load your season status.").foregroundStyle(AlphonsoColor.inkSoft)
            }
        }
        .scrollContentBackground(.hidden)
        .background(AlphonsoColor.surface)
        .navigationTitle("Season")
        .tint(AlphonsoColor.moss)
        .task {
            guard let accessToken = session.accessToken else { isLoading = false; return }
            let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
            status = try? await client.getSeasonStatus()
            isLoading = false
        }
    }
}
