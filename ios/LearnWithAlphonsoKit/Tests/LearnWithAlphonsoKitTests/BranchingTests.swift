import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// Interactive branching stories: the walk (the twin of public.finish_branching_story), stars, the scene-art URL, loading
/// the graph, and finishing a path through the Edge Function. Every request goes through an injected requester.
final class BranchingTests: XCTestCase {
    private let supabaseURL = URL(string: "https://project.supabase.co")!
    private let storyID = "22222222-2222-4222-8222-222222222222"

    private actor RequestBox {
        private(set) var requests: [URLRequest] = []
        func record(_ request: URLRequest) { requests.append(request) }
        var last: URLRequest? { requests.last }
    }

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> PodcastClient {
        PodcastClient(
            supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: response)
    }

    private func json(_ body: Any, status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        return (data, HTTPURLResponse(url: supabaseURL, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    private func ending(_ id: String, _ quality: EndingQuality) -> StoryEnding {
        StoryEnding(id: id, title: id, wrap: "wrap \(id)", quality: quality)
    }

    /// start (choice) -> a (link) -> b (choice) -> {good, lesser}; start's other option -> ok.
    private var graph: StoryGraph {
        StoryGraph(start: "start", map: [
            "start": StoryNode(segments: ["s"], choice: StoryChoice(prompt: "p", options: [
                StoryChoiceOption(label: "run", goto: "a", clue: true),
                StoryChoiceOption(label: "eat", goto: "okEnd", clue: false),
            ])),
            "a": StoryNode(segments: ["a"], next: "b"),
            "b": StoryNode(segments: ["b"], choice: StoryChoice(prompt: "q", options: [
                StoryChoiceOption(label: "kind", goto: "goodEnd", clue: true),
                StoryChoiceOption(label: "keep", goto: "lesserEnd", clue: false),
            ])),
            "goodEnd": StoryNode(segments: ["g"], ending: ending("good-id", .good)),
            "lesserEnd": StoryNode(segments: ["l"], ending: ending("lesser-id", .lesser)),
            "okEnd": StoryNode(segments: ["o"], ending: ending("ok-id", .ok)),
        ])
    }

    // MARK: - The walk

    func testTheWalkWaitsAtTheFirstChoiceThenFollowsLinksToTheNext() {
        XCTAssertEqual(Branching.walk(graph, path: []), .awaiting(nodeID: "start"))
        XCTAssertEqual(Branching.walk(graph, path: [0]), .awaiting(nodeID: "b"), "the linear node a is followed through")
    }

    func testTheWalkEndsAtTheEndingTheChosenOptionsLeadTo() {
        XCTAssertEqual(Branching.walk(graph, path: [0, 0]), .ended(nodeID: "goodEnd", ending: ending("good-id", .good)))
        XCTAssertEqual(Branching.walk(graph, path: [0, 1]), .ended(nodeID: "lesserEnd", ending: ending("lesser-id", .lesser)))
        XCTAssertEqual(Branching.walk(graph, path: [1]), .ended(nodeID: "okEnd", ending: ending("ok-id", .ok)))
    }

    func testAFabricatedPathIsInvalidNotAnEnding() {
        XCTAssertEqual(Branching.walk(graph, path: [1, 0]), .invalid(reason: "unconsumed-path"))
        XCTAssertEqual(Branching.walk(graph, path: [2]), .invalid(reason: "bad-option"))
        XCTAssertEqual(Branching.walk(graph, path: [-1]), .invalid(reason: "bad-option"))
    }

    func testABrokenGraphIsInvalidAndAnEndlessOneStops() {
        let missing = StoryGraph(start: "x", map: ["x": StoryNode(segments: [], next: "nowhere")])
        XCTAssertEqual(Branching.walk(missing, path: []), .invalid(reason: "missing-node"))
        let dead = StoryGraph(start: "x", map: ["x": StoryNode(segments: ["x"])])
        XCTAssertEqual(Branching.walk(dead, path: []), .invalid(reason: "dead-node"))
        let loop = StoryGraph(
            start: "x", map: ["x": StoryNode(segments: [], next: "y"), "y": StoryNode(segments: [], next: "x")])
        XCTAssertEqual(Branching.walk(loop, path: []), .invalid(reason: "too-deep"))
    }

    func testANodeKindIsOneOfChoiceLinkEndingOrInvalid() {
        XCTAssertEqual(Branching.nodeKind(graph.map["start"]), .choice)
        XCTAssertEqual(Branching.nodeKind(graph.map["a"]), .link)
        XCTAssertEqual(Branching.nodeKind(graph.map["goodEnd"]), .ending)
        XCTAssertEqual(Branching.nodeKind(StoryNode(segments: ["x"])), .invalid)
        XCTAssertEqual(Branching.nodeKind(nil), .invalid)
        let noOptions = StoryNode(segments: ["x"], choice: StoryChoice(prompt: "p", options: []))
        XCTAssertEqual(Branching.nodeKind(noOptions), .invalid, "a choice with nothing to pick would be a dead end")
    }

    func testChoosingAnOptionOutsideTheListIsNil() {
        XCTAssertEqual(Branching.chooseOption(graph, nodeID: "start", index: 1), "okEnd")
        XCTAssertNil(Branching.chooseOption(graph, nodeID: "start", index: 2))
        XCTAssertNil(Branching.chooseOption(graph, nodeID: "start", index: -1))
        XCTAssertNil(Branching.chooseOption(graph, nodeID: "a", index: 0), "a link node has no options")
    }

    func testEveryEndingIsListedInAStableOrder() {
        XCTAssertEqual(Branching.allEndings(graph).map(\.id), ["good-id", "lesser-id", "ok-id"])
    }

    // MARK: - Stars

    func testStarsBlendReachingAnEndingAGoodOneAndFindingThemAll() {
        XCTAssertEqual(Branching.stars(endingsFound: 0, endingsTotal: 4, reachedGood: false), 0)
        XCTAssertEqual(Branching.stars(endingsFound: 1, endingsTotal: 4, reachedGood: false), 1, "a lesser ending still earns one")
        XCTAssertEqual(Branching.stars(endingsFound: 1, endingsTotal: 4, reachedGood: true), 2)
        XCTAssertEqual(Branching.stars(endingsFound: 4, endingsTotal: 4, reachedGood: true), 3)
        XCTAssertEqual(Branching.stars(endingsFound: 4, endingsTotal: 4, reachedGood: false), 2)
        XCTAssertEqual(Branching.stars(endingsFound: 1, endingsTotal: 0, reachedGood: true), 2, "no total never counts as all found")
    }

    func testReachedGoodReadsTheStoredGraphNotAClaim() {
        XCTAssertTrue(Branching.reachedGood(graph, found: ["ok-id", "good-id"]))
        XCTAssertFalse(Branching.reachedGood(graph, found: ["ok-id", "lesser-id"]))
        XCTAssertFalse(Branching.reachedGood(graph, found: ["not-an-ending"]))
    }

    // MARK: - Scene art

    func testSceneArtIsTheBucketsPublicUrlOrNilForNoKey() {
        XCTAssertEqual(
            Branching.artURL(supabaseURL: supabaseURL, key: "en/a-day/n1.jpg")?.absoluteString,
            "https://project.supabase.co/storage/v1/object/public/story-art/en/a-day/n1.jpg")
        XCTAssertNil(Branching.artURL(supabaseURL: supabaseURL, key: nil))
        XCTAssertNil(Branching.artURL(supabaseURL: supabaseURL, key: ""))
        XCTAssertNil(Branching.artURL(supabaseURL: supabaseURL, key: "en/../secret.jpg"), "a key cannot climb out of the bucket")
    }

    // MARK: - Loading

    private var storedNodes: [String: Any] {
        [
            "start": "n1",
            "map": [
                "n1": [
                    "art": "en/s/n1.jpg", "segments": ["One."],
                    "choice": ["prompt": "Which?", "options": [
                        ["label": "A", "goto": "n2", "clue": true], ["label": "B", "goto": "n3", "clue": false],
                    ]],
                ] as [String: Any],
                "n2": ["segments": ["Two."], "ending": ["id": "e2", "title": "T", "wrap": "W", "quality": "good"]] as [String: Any],
                "n3": ["segments": ["Three."], "next": "n2"] as [String: Any],
            ] as [String: Any],
        ]
    }

    func testABranchingStoryIsReadWithItsGraphAndArtUrls() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.json([[
                "id": self.storyID, "course": "en", "level_id": "A2", "title": "A Day", "nodes": self.storedNodes,
                "branching": true, "published": true,
            ] as [String: Any]])
        }
        let story = try await client.fetchBranchingStory(id: storyID)!
        let query = await box.last!.url!.query!
        XCTAssertTrue(query.contains("published=eq.true") && query.contains("branching=eq.true"))
        XCTAssertEqual(story.title, "A Day")
        XCTAssertEqual(story.graph.start, "n1")
        XCTAssertEqual(story.graph.map["n1"]?.artURL?.lastPathComponent, "n1.jpg")
        XCTAssertNil(story.graph.map["n2"]?.artURL, "a node with no art key has no URL: the reader draws a placeholder")
        XCTAssertEqual(story.graph.map["n1"]?.choice?.options.map(\.goto), ["n2", "n3"])
        XCTAssertEqual(story.graph.map["n2"]?.ending, StoryEnding(id: "e2", title: "T", wrap: "W", quality: .good))
        XCTAssertEqual(story.graph.map["n3"]?.next, "n2")
        XCTAssertEqual(Branching.walk(story.graph, path: [0]), .ended(nodeID: "n2", ending: story.graph.map["n2"]!.ending!))
    }

    func testAMissingStoryOrAGraphWithoutAStartNodeIsNil() async throws {
        let none = makeClient { _ in self.json([[String: Any]]()) }
        let missing = try await none.fetchBranchingStory(id: storyID)
        XCTAssertNil(missing)
        let noStart = makeClient { _ in
            self.json([[
                "id": self.storyID, "course": "en", "level_id": "A2", "title": "T",
                "nodes": ["start": "ghost", "map": ["n1": ["segments": ["x"]]]] as [String: Any],
            ] as [String: Any]])
        }
        let unusable = try await noStart.fetchBranchingStory(id: storyID)
        XCTAssertNil(unusable)
    }

    func testTheLibraryFlagsBranchingStoriesAndSaysChooseYourPath() async throws {
        let client = makeClient { request in
            if request.url!.path.hasSuffix("story_progress") { return self.json([[String: Any]]()) }
            return self.json([[
                "id": self.storyID, "course": "en", "level_id": "A2", "slug": "a-day", "title": "A Day",
                "segments": [String](), "sort_order": 1, "published": true, "branching": true,
            ] as [String: Any]])
        }
        let list = try await client.fetchStories(course: "en")
        XCTAssertTrue(list[0].branching)
        XCTAssertEqual(Stories.visible(list, course: "en").count, 1)
        XCTAssertEqual(Stories.status(list[0]), "Choose your path")
    }

    // MARK: - Finishing

    func testFinishingSendsOnlyThePathToTheEdgeFunctionNeverAnEndingNeverTheRpc() async throws {
        let box = RequestBox()
        let client = makeClient { request in
            await box.record(request)
            return self.json([
                "status": "applied", "endingId": "good-id", "quality": "good", "endingsFound": ["good-id"],
                "endingsTotal": 4, "credited": true,
            ] as [String: Any])
        }
        let result = try await client.finishBranchingStory(storyID: storyID, path: [0, 1])
        let request = await box.last!
        XCTAssertEqual(request.url?.absoluteString, "https://project.supabase.co/functions/v1/finish-branching-story")
        XCTAssertFalse(request.url!.absoluteString.contains("rpc/finish_branching_story"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer user-access-token")
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        XCTAssertEqual(Set(body.keys), ["storyId", "path"], "the path only: never an ending, a credit or a user id")
        XCTAssertEqual(body["path"] as? [Int], [0, 1])
        XCTAssertEqual(result.endingID, "good-id", "the shown ending is the server's")
        XCTAssertEqual(result.quality, .good)
        XCTAssertEqual(result.endingsTotal, 4)
        XCTAssertTrue(result.credited)
    }

    func testFinishRefusalsMapToStableErrors() async {
        let cases: [(Int, PodcastQuizError)] = [
            (404, .notFound), (400, .invalidAnswers), (401, .unauthorized), (403, .unauthorized), (503, .server),
        ]
        for (status, expected) in cases {
            let client = makeClient { _ in self.json([String: String](), status: status) }
            do {
                _ = try await client.finishBranchingStory(storyID: storyID, path: [0])
                XCTFail("expected a throw for \(status)")
            } catch {
                XCTAssertEqual(error as? PodcastQuizError, expected, "status \(status)")
            }
        }
    }

    func testAnUnreadableSuccessIsAnErrorNeverAnEnding() async {
        let client = makeClient { _ in self.json(["status": "applied"]) }
        do {
            _ = try await client.finishBranchingStory(storyID: storyID, path: [0])
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? PodcastQuizError, .server)
        }
    }

    func testANetworkFailureIsRetryableOffline() async {
        let client = makeClient { _ in throw URLError(.notConnectedToInternet) }
        do {
            _ = try await client.finishBranchingStory(storyID: storyID, path: [])
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? PodcastQuizError, .offline)
        }
    }
}
