import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// V4 candidate #7 (deeper gamification) -- season ladder. In its own
/// extension file, not added to ProgressSyncClient.swift directly, so
/// this can land in parallel with the Teams/Challenges plans without a
/// merge conflict on a shared file -- see that file's own comment on
/// the stored properties this extension reads.
public struct SeasonLastWeekResult: Sendable, Equatable {
    public let division: Int
    public let rankInCohort: Int
    public let cohortSize: Int
}

public struct SeasonStatus: Sendable, Equatable {
    public let division: Int
    public let rankInCohort: Int
    public let cohortSize: Int
    public let lastWeekResult: SeasonLastWeekResult?
}

extension ProgressSyncClient {

/// Calls the get-season-status Edge Function -- resolves the caller's
/// previous week's cohort lazily as a side effect (same pattern as
/// fetchLeaderboard's direct-RPC calls, just invoking a Function
/// instead of a Postgres RPC since the resolution logic is too
/// complex for plain SQL).
public func getSeasonStatus() async throws -> SeasonStatus? {
    var request = URLRequest(url: supabaseURL.appendingPathComponent("functions/v1/get-season-status"))
    request.httpMethod = "GET"
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let division = json["division"] as? Int,
          let rankInCohort = json["rankInCohort"] as? Int,
          let cohortSize = json["cohortSize"] as? Int else {
        return nil
    }
    var lastWeek: SeasonLastWeekResult?
    if let lw = json["lastWeekResult"] as? [String: Any],
       let lwDivision = lw["division"] as? Int,
       let lwRank = lw["rankInCohort"] as? Int,
       let lwSize = lw["cohortSize"] as? Int {
        lastWeek = SeasonLastWeekResult(division: lwDivision, rankInCohort: lwRank, cohortSize: lwSize)
    }
    return SeasonStatus(division: division, rankInCohort: rankInCohort, cohortSize: cohortSize, lastWeekResult: lastWeek)
}

} // extension ProgressSyncClient
