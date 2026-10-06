import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

extension ProgressSyncClient {
    /// The caller's team mission for the current week (the `get_team_mission` RPC), or nil when they have
    /// no team. The server resolves any payout as a side effect of this read, so it is called when the
    /// card appears, never in a tight loop. A server error or a malformed row THROWS: it must not look
    /// like "no team", which would hide a broken contract behind a missing card.
    public func getTeamMission(now: Date = Date()) async throws -> TeamMission? {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/get_team_mission"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [String: String]())

        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        guard let row = rows.first else { return nil }
        guard let mission = TeamMission(row: row, now: now) else {
            throw ProgressSyncError.invalidPayload
        }
        return mission
    }
}
