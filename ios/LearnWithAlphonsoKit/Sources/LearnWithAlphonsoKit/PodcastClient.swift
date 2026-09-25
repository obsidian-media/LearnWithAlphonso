import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum PodcastClientError: Error, Equatable {
    case badResponse
    case server(status: Int)
    case invalidPayload
    /// The access token was rejected. Distinct from `.server` on purpose:
    /// position saves are fire-and-forget, so a 401 folded into a generic
    /// failure would make resume quietly stop working for the rest of a
    /// session with nothing surfaced. The caller is expected to stop
    /// issuing saves rather than keep firing calls that cannot succeed.
    case unauthorized
    /// Another device wrote this playback row since we last read it, so
    /// our optimistic-concurrency filter matched nothing. The caller
    /// should re-read rather than retry: our value is based on a stale
    /// observation.
    case staleWrite
}

/// Reads and writes the podcast library over PostgREST.
///
/// Mirrors `ProgressSyncClient` deliberately -- same init shape, same
/// injected `Requester`, same header construction -- because that is what
/// lets every test here run without a network.
///
/// This is the first time the iOS app fetches *content* from the server:
/// `ContentStore` is explicitly "No network calls, no async" because
/// curriculum ships in the bundle. Podcast content cannot, since growing
/// the library without an App Store release is the whole point.
public final class PodcastClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    let supabaseURL: URL
    let anonKey: String
    let accessToken: String
    let requester: Requester

    public init(
        supabaseURL: URL,
        anonKey: String,
        accessToken: String,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        self.supabaseURL = supabaseURL
        self.anonKey = anonKey
        self.accessToken = accessToken
        self.requester = requester
    }

    // MARK: - Requests

    private func request(path: String, query: String? = nil, method: String) -> URLRequest {
        var components = URLComponents(
            url: supabaseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )!
        components.percentEncodedQuery = query
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    private static func requireSuccess(response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw PodcastClientError.badResponse }
        if http.statusCode == 401 || http.statusCode == 403 { throw PodcastClientError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            throw PodcastClientError.server(status: http.statusCode)
        }
    }

    private static func rows(from data: Data) throws -> [[String: Any]] {
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw PodcastClientError.invalidPayload
        }
        return rows
    }

    // MARK: - Reads

    /// Every folder, flat. The caller builds the tree with `PodcastTree`,
    /// matching how the web app does it.
    public func fetchFolders() async throws -> [PodcastFolder] {
        let request = request(
            path: "rest/v1/podcast_folders",
            query: "select=id,parent_id,slug,title,description,sort_order&order=sort_order.asc",
            method: "GET"
        )
        let (data, response) = try await requester(request)
        try Self.requireSuccess(response: response)
        return try Self.rows(from: data).compactMap { row in
            guard let id = row["id"] as? String,
                  let slug = row["slug"] as? String,
                  let title = row["title"] as? String else { return nil }
            return PodcastFolder(
                id: id,
                parentID: row["parent_id"] as? String,
                slug: slug,
                title: title,
                description: row["description"] as? String,
                sortOrder: row["sort_order"] as? Int ?? 0
            )
        }
    }

    /// Published episodes in one folder, with this user's saved position.
    ///
    /// Two requests merged client-side: PostgREST has no equivalent of the
    /// web server function's join. RLS already restricts episodes to
    /// `published = true` and playback rows to the caller, so neither is
    /// re-checked here.
    public func fetchEpisodes(folderID: String) async throws -> [PodcastEpisode] {
        let episodesRequest = request(
            path: "rest/v1/podcast_episodes",
            query: "select=id,folder_id,slug,title,description,audio_path,duration_seconds"
                + "&folder_id=eq.\(folderID)&order=sort_order.asc",
            method: "GET"
        )
        let (episodeData, episodeResponse) = try await requester(episodesRequest)
        try Self.requireSuccess(response: episodeResponse)
        let episodeRows = try Self.rows(from: episodeData)

        // A failed playback read must not fail the listing: the episodes
        // still play, they just start from the beginning. Same posture as
        // the web handler, and as the iOS app's theme hydration.
        var positions: [String: (position: Int, updatedAt: String?)] = [:]
        if !episodeRows.isEmpty {
            let playbackRequest = request(
                path: "rest/v1/podcast_playback",
                query: "select=episode_id,position_seconds,updated_at",
                method: "GET"
            )
            if let (playbackData, playbackResponse) = try? await requester(playbackRequest),
               (try? Self.requireSuccess(response: playbackResponse)) != nil,
               let playbackRows = try? Self.rows(from: playbackData) {
                for row in playbackRows {
                    guard let episodeID = row["episode_id"] as? String else { continue }
                    positions[episodeID] = (
                        row["position_seconds"] as? Int ?? 0,
                        row["updated_at"] as? String
                    )
                }
            }
        }

        return episodeRows.compactMap { row in
            guard let id = row["id"] as? String,
                  let folderID = row["folder_id"] as? String,
                  let slug = row["slug"] as? String,
                  let title = row["title"] as? String,
                  let audioPath = row["audio_path"] as? String,
                  let duration = row["duration_seconds"] as? Int,
                  // An episode with no usable audio path is skipped rather
                  // than surfaced as a row that cannot play.
                  let audioURL = PodcastPlayback.audioURL(supabaseURL: supabaseURL, audioPath: audioPath)
            else { return nil }

            let saved = positions[id]
            let clamped = PodcastPlayback.clampPosition(
                Double(saved?.position ?? 0),
                durationSeconds: Double(duration)
            )
            return PodcastEpisode(
                id: id,
                folderID: folderID,
                slug: slug,
                title: title,
                description: row["description"] as? String,
                audioURL: audioURL,
                durationSeconds: duration,
                positionSeconds: Int(clamped),
                playbackUpdatedAt: saved?.updatedAt
            )
        }
    }

    /// Episodes whose title or description contains `query`, across every
    /// folder. Mirrors the web app's `searchEpisodes` server function.
    ///
    /// Flat by design: the reason to search is not knowing where a thing
    /// lives. RLS keeps this to published episodes.
    ///
    /// Returns an empty array **without a request** when the query is too
    /// short to run -- `PodcastSearch` declines below the minimum length, and
    /// sending it anyway would hand back the whole library for one character.
    ///
    /// Results carry no resume position: a search result is a way to find an
    /// episode, and the player reads the authoritative position when it opens
    /// one.
    public func searchEpisodes(query: String) async throws -> [PodcastEpisode] {
        guard let filter = PodcastSearch.ilikeOrFilter(
            query: query,
            columns: ["title", "description"]
        ) else { return [] }

        // Encoded here because `request(path:query:)` assigns
        // percentEncodedQuery directly -- handing it the raw filter would undo
        // the quoting that keeps commas and parens out of the grammar.
        let encoded = PodcastSearch.percentEncodedFilter(filter)
        let request = request(
            path: "rest/v1/podcast_episodes",
            query: "select=id,folder_id,slug,title,description,audio_path,duration_seconds"
                + "&or=(\(encoded))&order=title.asc&limit=50",
            method: "GET"
        )
        let (data, response) = try await requester(request)
        try Self.requireSuccess(response: response)

        return try Self.rows(from: data).compactMap { row in
            guard let id = row["id"] as? String,
                  let folderID = row["folder_id"] as? String,
                  let slug = row["slug"] as? String,
                  let title = row["title"] as? String,
                  let audioPath = row["audio_path"] as? String,
                  let duration = row["duration_seconds"] as? Int,
                  let audioURL = PodcastPlayback.audioURL(supabaseURL: supabaseURL, audioPath: audioPath)
            else { return nil }
            return PodcastEpisode(
                id: id,
                folderID: folderID,
                slug: slug,
                title: title,
                description: row["description"] as? String,
                audioURL: audioURL,
                durationSeconds: duration,
                positionSeconds: 0,
                playbackUpdatedAt: nil
            )
        }
    }

    // MARK: - Writes

    /// Saves a resume position using optimistic concurrency on
    /// `updated_at`.
    ///
    /// `lastSeenUpdatedAt` is the value read with the episode. The write is
    /// filtered on it, so a device whose observation is stale matches
    /// nothing and gets `.staleWrite` instead of overwriting a fresher
    /// position.
    ///
    /// The two obvious alternatives are both wrong. Guarding on position
    /// magnitude (accept only a larger value) rejects a deliberate rewind,
    /// so scrubbing back to re-listen would snap forward. Guarding on
    /// `now()` does nothing, because `now()` is evaluated when the write
    /// lands -- the stale device's flush *is* the newest write. Only
    /// observation recency separates the two, and a rewind is a fresh
    /// observation.
    public func savePlaybackPosition(
        episodeID: String,
        positionSeconds: Int,
        completed: Bool,
        lastSeenUpdatedAt: String?
    ) async throws {
        var body: [String: Any] = [
            "episode_id": episodeID,
            "position_seconds": positionSeconds,
            "updated_at": ISO8601DateFormatter().string(from: Date()),
        ]
        if completed {
            body["completed_at"] = ISO8601DateFormatter().string(from: Date())
        }

        var request: URLRequest
        if let lastSeenUpdatedAt {
            let encoded = lastSeenUpdatedAt.addingPercentEncoding(
                withAllowedCharacters: .alphanumerics
            ) ?? lastSeenUpdatedAt
            request = self.request(
                path: "rest/v1/podcast_playback",
                query: "episode_id=eq.\(episodeID)&updated_at=eq.\(encoded)",
                method: "PATCH"
            )
        } else {
            // No row yet, so there is nothing to guard against: a PATCH
            // would match nothing and look like a conflict.
            request = self.request(path: "rest/v1/podcast_playback", method: "POST")
        }
        // Ask for the affected rows back -- an empty array is how a
        // filtered PATCH reports that it matched nothing.
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await requester(request)
        try Self.requireSuccess(response: response)
        if try Self.rows(from: data).isEmpty {
            throw PodcastClientError.staleWrite
        }
    }

    /// Records a play session through the `record_podcast_play_event`
    /// SECURITY DEFINER function.
    ///
    /// **Never a direct insert.** `authenticated` holds no INSERT grant on
    /// `podcast_play_events` (supabase/migrations/
    /// 20260926223031_podcast_play_event_rpc.sql), and this call is
    /// fire-and-forget, so a direct insert would fail as permission denied
    /// inside a swallowed error and play recording would silently never
    /// happen. The function also takes the user from `auth.uid()`, the
    /// timestamp from `now()`, and bounds the seconds by the episode's real
    /// duration.
    public func recordPlayEvent(episodeID: String, secondsListened: Int) async throws {
        var request = request(path: "rest/v1/rpc/record_podcast_play_event", method: "POST")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "_episode_id": episodeID,
            "_seconds_listened": secondsListened,
        ])
        let (_, response) = try await requester(request)
        try Self.requireSuccess(response: response)
    }
}
