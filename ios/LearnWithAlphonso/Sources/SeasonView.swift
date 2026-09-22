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
                ProgressView()
            } else if let status {
                Section {
                    Text("Division \(status.division)").font(.largeTitle.bold())
                    Text("Rank \(status.rankInCohort) of \(status.cohortSize) this week").foregroundStyle(.secondary)
                }
                if let lastWeek = status.lastWeekResult {
                    Section("Last week") {
                        Text("Division \(lastWeek.division), rank \(lastWeek.rankInCohort) of \(lastWeek.cohortSize)")
                    }
                }
            } else {
                Text("Couldn't load your season status.").foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Season")
        .task {
            guard let accessToken = session.accessToken else { isLoading = false; return }
            let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
            status = try? await client.getSeasonStatus()
            isLoading = false
        }
    }
}
