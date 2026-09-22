import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class ProgressSyncClientSeasonTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: response)
    }

    /// get-season-status is an Edge Function returning a single JSON
    /// *object*, not a row array like every RPC call elsewhere in this
    /// codebase -- so this does NOT wrap `body` as `[body]` the way
    /// ProgressSyncClientTests.swift's jsonResponse does for RPC calls.
    private func jsonObjectResponse(for url: URL, body: [String: Any], status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let http = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, http)
    }

    // MARK: - Season

    func testGetSeasonStatusDecodesWithoutLastWeekResult() async throws {
        let client = makeClient { request in
            self.jsonObjectResponse(for: request.url!, body: ["division": 3, "rankInCohort": 5, "cohortSize": 28, "lastWeekResult": NSNull()])
        }
        let status = try await client.getSeasonStatus()
        XCTAssertEqual(status, SeasonStatus(division: 3, rankInCohort: 5, cohortSize: 28, lastWeekResult: nil))
    }

    func testGetSeasonStatusDecodesWithLastWeekResult() async throws {
        let client = makeClient { request in
            self.jsonObjectResponse(for: request.url!, body: [
                "division": 3, "rankInCohort": 5, "cohortSize": 28,
                "lastWeekResult": ["division": 2, "rankInCohort": 1, "cohortSize": 25],
            ])
        }
        let status = try await client.getSeasonStatus()
        XCTAssertEqual(status?.lastWeekResult, SeasonLastWeekResult(division: 2, rankInCohort: 1, cohortSize: 25))
    }
}
