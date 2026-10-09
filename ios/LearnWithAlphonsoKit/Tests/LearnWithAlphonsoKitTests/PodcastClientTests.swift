import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Same shape as ProgressSyncClientTests: every request goes through an
/// injected requester, so no test here touches the network.
final class PodcastClientTests: XCTestCase {
    private let supabaseURL = URL(string: "https://project.supabase.co")!

    /// Collects requests across the concurrency boundary the requester
    /// closure imposes.
    private actor RequestBox {
        private(set) var requests: [URLRequest] = []
        func record(_ request: URLRequest) { requests.append(request) }
        var last: URLRequest? { requests.last }
    }

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> PodcastClient {
        PodcastClient(
            supabaseURL: supabaseURL,
            anonKey: "publishable-key",
            accessToken: "user-access-token",
            requester: response
        )
    }

    private func jsonResponse(for url: URL, body: Any, status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let http = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, http)
    }

    private func episodeRow(id: String = "e1", duration: Int = 300) -> [String: Any] {
        [
            "id": id,
            "folder_id": "f1",
            "slug": "ordering-coffee",
            "title": "Ordering Coffee",
            "description": NSNull(),
            "audio_path": "en/a1/ordering-coffee.mp3",
            "duration_seconds": duration,
        ]
    }

    // MARK: - fetchFolders

    func testFetchFoldersMapsSnakeCaseRows() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [[
                "id": "f1", "parent_id": NSNull(), "slug": "en",
                "title": "English", "description": "All English audio", "sort_order": 2,
            ]])
        }
        let folders = try await client.fetchFolders()
        XCTAssertEqual(folders.count, 1)
        XCTAssertEqual(folders[0].id, "f1")
        XCTAssertNil(folders[0].parentID)
        XCTAssertEqual(folders[0].slug, "en")
        XCTAssertEqual(folders[0].sortOrder, 2)
    }

    // MARK: - fetchEpisodes

    func testFetchEpisodesMergesThisUsersSavedPosition() async throws {
        let client = makeClient { request in
            let url = request.url!
            if url.absoluteString.contains("podcast_episodes") {
                return self.jsonResponse(for: url, body: [self.episodeRow()])
            }
            return self.jsonResponse(for: url, body: [[
                "episode_id": "e1", "position_seconds": 90,
                "updated_at": "2026-09-24T10:00:00Z",
            ]])
        }
        let episodes = try await client.fetchEpisodes(folderID: "f1")
        XCTAssertEqual(episodes.first?.positionSeconds, 90)
        XCTAssertEqual(episodes.first?.playbackUpdatedAt, "2026-09-24T10:00:00Z")
        XCTAssertTrue(episodes.first!.audioURL.absoluteString.hasSuffix("ordering-coffee.mp3"))
    }

    // Review Focus #5: the stored duration can be wrong.
    func testFetchEpisodesClampsAPositionPastTheEnd() async throws {
        let client = makeClient { request in
            let url = request.url!
            if url.absoluteString.contains("podcast_episodes") {
                return self.jsonResponse(for: url, body: [self.episodeRow(duration: 300)])
            }
            return self.jsonResponse(for: url, body: [[
                "episode_id": "e1", "position_seconds": 400,
                "updated_at": "2026-09-24T10:00:00Z",
            ]])
        }
        let episodes = try await client.fetchEpisodes(folderID: "f1")
        XCTAssertEqual(episodes.first?.positionSeconds, 0)
    }

    func testFetchEpisodesStillReturnsEpisodesWhenThePlaybackReadFails() async throws {
        // The episodes still play, they just start from the beginning --
        // mirrors the web handler's posture.
        let client = makeClient { request in
            let url = request.url!
            if url.absoluteString.contains("podcast_episodes") {
                return self.jsonResponse(for: url, body: [self.episodeRow()])
            }
            return self.jsonResponse(for: url, body: [:], status: 500)
        }
        let episodes = try await client.fetchEpisodes(folderID: "f1")
        XCTAssertEqual(episodes.count, 1)
        XCTAssertEqual(episodes.first?.positionSeconds, 0)
        XCTAssertNil(episodes.first?.playbackUpdatedAt)
    }

    func testFetchEpisodesSkipsARowWithNoUsableAudioPath() async throws {
        let client = makeClient { request in
            let url = request.url!
            if url.absoluteString.contains("podcast_episodes") {
                var broken = self.episodeRow()
                broken["audio_path"] = ""
                return self.jsonResponse(for: url, body: [broken, self.episodeRow(id: "e2")])
            }
            return self.jsonResponse(for: url, body: [])
        }
        let episodes = try await client.fetchEpisodes(folderID: "f1")
        XCTAssertEqual(episodes.map(\.id), ["e2"])
    }

    // Review Focus #2: a 401 must be distinguishable, so the caller can
    // stop pretending saves are landing.
    func testSurfacesUnauthorizedDistinctly() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [:], status: 401)
        }
        do {
            _ = try await client.fetchFolders()
            XCTFail("expected an unauthorized error")
        } catch {
            XCTAssertEqual(error as? PodcastClientError, .unauthorized)
        }
    }

    // MARK: - recordPlayEvent

    // Global Constraint: `authenticated` has no INSERT grant on
    // podcast_play_events (20260926223031). A direct insert would fail as
    // permission denied inside a fire-and-forget call, so play recording
    // would silently never happen -- the exact trap the web client was
    // just moved off.
    // MARK: - searchEpisodes

    func testSearchEpisodesSendsTheEncodedFilter() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.jsonResponse(for: request.url!, body: [self.episodeRow()])
        }
        _ = try await client.searchEpisodes(query: "coffee")
        let query = await box.last!.url!.query ?? ""
        XCTAssertTrue(query.contains("or="), query)
        // Encoded, not raw: PodcastClient assigns percentEncodedQuery
        // directly, so a raw quote or comma here would reshape the request.
        XCTAssertFalse(query.contains("\""), query)
        XCTAssertTrue(query.contains("%22"), query)
    }

    func testSearchEpisodesDoesNotCallTheServerForAQueryTooShortToRun() async throws {
        // buildIlikeOrFilter declines below the minimum length. Sending the
        // request anyway would return the whole library for one character.
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.jsonResponse(for: request.url!, body: [])
        }
        let results = try await client.searchEpisodes(query: "c")
        XCTAssertTrue(results.isEmpty)
        let count = await box.requests.count
        XCTAssertEqual(count, 0, "a one-character query must not reach the network")
    }

    func testSearchEpisodesReturnsEpisodesWithoutAResumePosition() async throws {
        // A search result is a way to FIND an episode; the player reads the
        // authoritative position when it opens one.
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [self.episodeRow()])
        }
        let results = try await client.searchEpisodes(query: "coffee")
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results.first?.positionSeconds, 0)
        XCTAssertNil(results.first?.playbackUpdatedAt)
    }

    func testRecordPlayEventCallsTheRPCRatherThanInsertingDirectly() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.jsonResponse(for: request.url!, body: [])
        }
        try await client.recordPlayEvent(episodeID: "e1", secondsListened: 42)
        let request = await box.last!
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.path.hasSuffix("/rest/v1/rpc/record_podcast_play_event"))
        XCTAssertFalse(request.url!.path.contains("/rest/v1/podcast_play_events"))
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        XCTAssertEqual(body["_episode_id"] as? String, "e1")
        XCTAssertEqual(body["_seconds_listened"] as? Int, 42)
    }

    // MARK: - savePlaybackPosition

    // Review Focus #3: optimistic concurrency on updated_at, not magnitude
    // (which would reject a rewind) and not now() (which is evaluated at
    // write time, so the stale flush is the newest write).
    func testSavePlaybackPositionGuardsOnTheUpdatedAtItLastRead() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.jsonResponse(for: request.url!, body: [["position_seconds": 90]])
        }
        try await client.savePlaybackPosition(
            episodeID: "e1",
            positionSeconds: 90,
            completed: false,
            lastSeenUpdatedAt: "2026-09-24T10:00:00Z"
        )
        let request = await box.last!
        XCTAssertEqual(request.httpMethod, "PATCH")
        let query = request.url!.query ?? ""
        XCTAssertTrue(query.contains("episode_id=eq.e1"), query)
        XCTAssertTrue(query.contains("updated_at=eq."), query)
    }

    func testReportsAStaleWriteWhenAnotherDeviceHasWrittenSince() async throws {
        // An empty representation means the filter matched nothing.
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [])
        }
        do {
            try await client.savePlaybackPosition(
                episodeID: "e1",
                positionSeconds: 90,
                completed: false,
                lastSeenUpdatedAt: "2026-09-24T10:00:00Z"
            )
            XCTFail("expected a stale-write error")
        } catch {
            XCTAssertEqual(error as? PodcastClientError, .staleWrite)
        }
    }

    // A rewind is a fresh observation and must be accepted -- this is the
    // case a magnitude guard would wrongly reject.
    func testAcceptsARewindToAnEarlierPosition() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.jsonResponse(for: request.url!, body: [["position_seconds": 30]])
        }
        try await client.savePlaybackPosition(
            episodeID: "e1",
            positionSeconds: 30,
            completed: false,
            lastSeenUpdatedAt: "2026-09-24T10:00:00Z"
        )
        let body = try JSONSerialization.jsonObject(with: await box.last!.httpBody!) as! [String: Any]
        XCTAssertEqual(body["position_seconds"] as? Int, 30)
    }

    // The first save has no row to guard against. It must be an upsert on the
    // (user_id, episode_id) key and must NOT send user_id: the database default
    // (auth.uid(), migration 20261012500000) supplies it, and the RLS policy checks it.
    func testTheFirstSaveUpsertsOnTheUserEpisodeKeyWithoutSendingUserID() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.jsonResponse(for: request.url!, body: [["position_seconds": 5, "updated_at": "2026-10-12T10:00:05+00:00"]], status: 201)
        }
        try await client.savePlaybackPosition(episodeID: "e1", positionSeconds: 5, completed: false, lastSeenUpdatedAt: nil)
        let request = await box.last!
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.path.hasSuffix("/rest/v1/podcast_playback"))
        XCTAssertEqual(request.url!.query, "on_conflict=user_id,episode_id")
        let prefer = request.value(forHTTPHeaderField: "Prefer") ?? ""
        XCTAssertTrue(prefer.contains("resolution=merge-duplicates"), prefer)
        XCTAssertTrue(prefer.contains("return=representation"), prefer)
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        XCTAssertNil(body["user_id"], "the server owns user_id; a client-supplied one is either redundant or an attack")
        XCTAssertEqual(body["episode_id"] as? String, "e1")
    }

    // The next write is guarded on what the SERVER stored, not on the device clock.
    func testReturnsTheUpdatedAtTheServerStored() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: [["position_seconds": 40, "updated_at": "2026-10-12T10:00:40+00:00"]])
        }
        let stored = try await client.savePlaybackPosition(
            episodeID: "e1", positionSeconds: 40, completed: false, lastSeenUpdatedAt: "2026-10-12T10:00:30+00:00"
        )
        XCTAssertEqual(stored, "2026-10-12T10:00:40+00:00")
    }

    func testAGuardedPatchDoesNotAskForAMerge() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.jsonResponse(for: request.url!, body: [["position_seconds": 40, "updated_at": "x"]])
        }
        try await client.savePlaybackPosition(episodeID: "e1", positionSeconds: 40, completed: false, lastSeenUpdatedAt: "2026-10-12T10:00:30+00:00")
        let request = await box.last!
        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Prefer"), "return=representation")
    }

    func testAFailedFirstSaveIsReportedNotSwallowed() async throws {
        let client = makeClient { request in
            self.jsonResponse(for: request.url!, body: ["code": "23502"], status: 400)
        }
        do {
            try await client.savePlaybackPosition(episodeID: "e1", positionSeconds: 5, completed: false, lastSeenUpdatedAt: nil)
            XCTFail("expected a server error")
        } catch {
            XCTAssertEqual(error as? PodcastClientError, .server(status: 400))
        }
    }

    func testFetchFoldersReadsTheCourse() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.jsonResponse(for: request.url!, body: [[
                "id": "f1", "parent_id": NSNull(), "slug": "fr", "title": "French",
                "description": NSNull(), "sort_order": 1, "course": "fr",
            ]])
        }
        let folders = try await client.fetchFolders()
        XCTAssertEqual(folders.first?.course, "fr")
        let query = await box.last!.url!.query ?? ""
        XCTAssertTrue(query.contains("course"), query)
    }

    func testFetchPublishedIndexReadsIDsAndFoldersOfPublishedEpisodesOnly() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.jsonResponse(for: request.url!, body: [["id": "e1", "folder_id": "f1"], ["id": "e2"]])
        }
        let index = try await client.fetchPublishedIndex()
        XCTAssertEqual(index, [PodcastPublishedEpisodeRef(episodeID: "e1", folderID: "f1")])
        let query = await box.last!.url!.query ?? ""
        XCTAssertTrue(query.contains("select=id,folder_id"), query)
        XCTAssertTrue(query.contains("published=eq.true"), query)
    }

    func testFetchPublishedIndexPagesPastTheServersRowCapUntilAShortPage() async throws {
        let box = RequestBox()
        let pageSize = PodcastClient.publishedIndexPageSize
        let client = makeClient { request in
            await box.record(request)
            let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems ?? []
            let offset = Int(items.first { $0.name == "offset" }?.value ?? "") ?? -1
            let count = offset == 0 ? pageSize : (offset == pageSize ? 3 : 0)
            let rows: [[String: Any]] = (0..<count).map { ["id": "e\(offset + $0)", "folder_id": "f1"] }
            return self.jsonResponse(for: request.url!, body: rows)
        }
        let index = try await client.fetchPublishedIndex()
        XCTAssertEqual(index.count, pageSize + 3, "a catalogue larger than max_rows must not be truncated")
        XCTAssertEqual(index.last?.episodeID, "e\(pageSize + 2)")

        let requests = await box.requests
        XCTAssertEqual(requests.count, 2, "a short second page ends the loop: no third request")
        for (position, request) in requests.enumerated() {
            let query = request.url!.query ?? ""
            XCTAssertTrue(query.contains("order=id.asc"), "stable paging needs a total order: \(query)")
            XCTAssertTrue(query.contains("limit=\(pageSize)"), query)
            XCTAssertTrue(query.contains("offset=\(position * pageSize)"), query)
            XCTAssertTrue(query.contains("published=eq.true"), query)
        }
    }

    func testFetchPublishedIndexAfterExactlyOneFullPageAsksForTheNextToBeSure() async throws {
        let box = RequestBox()
        let pageSize = PodcastClient.publishedIndexPageSize
        let client = makeClient { request in
            await box.record(request)
            let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems ?? []
            let offset = Int(items.first { $0.name == "offset" }?.value ?? "") ?? -1
            let rows: [[String: Any]] = offset == 0 ? (0..<pageSize).map { ["id": "e\($0)", "folder_id": "f1"] } : []
            return self.jsonResponse(for: request.url!, body: rows)
        }
        let index = try await client.fetchPublishedIndex()
        XCTAssertEqual(index.count, pageSize)
        let requestCount = await box.requests.count
        XCTAssertEqual(requestCount, 2)
    }

    func testMarksCompletionWhenAskedTo() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.jsonResponse(for: request.url!, body: [["position_seconds": 0]])
        }
        try await client.savePlaybackPosition(
            episodeID: "e1",
            positionSeconds: 0,
            completed: true,
            lastSeenUpdatedAt: "2026-09-24T10:00:00Z"
        )
        let body = try JSONSerialization.jsonObject(with: await box.last!.httpBody!) as! [String: Any]
        XCTAssertNotNil(body["completed_at"])
    }
}
