import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

extension ProgressSyncClient {

/// The leaderboard country (profiles.country): what other learners see next to the name. Complete your profile reads
/// it so a country the learner already shows stays on (the web's prefill), instead of being cleared by a flag
/// switch that started off. Nil for no row, no country, or a malformed payload. Written only by the server's
/// learner-profile save (LearnerProfileClient), never from here.
public func fetchProfileCountry(userID: String) async throws -> String? {
    var request = restRequest(path: "profiles", query: [
        URLQueryItem(name: "select", value: "country"),
        URLQueryItem(name: "id", value: "eq.\(userID)"),
    ])
    request.httpMethod = "GET"
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
    guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
          let country = rows.first?["country"] as? String,
          LearnerProfileLists.countries.contains(country) else {
        return nil
    }
    return country
}

}
