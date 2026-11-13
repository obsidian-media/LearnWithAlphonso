import XCTest
@testable import LearnWithAlphonsoKit

final class PathStopRoutingTests: XCTestCase {
    private func ref(_ kind: String, _ id: String, scene: Int? = nil) -> PathItemRef {
        // PathItemRef is Decodable only, so build it the way the app receives it.
        let json = scene.map { #"{"kind":"\#(kind)","id":"\#(id)","sceneIndex":\#($0)}"# }
            ?? #"{"kind":"\#(kind)","id":"\#(id)"}"#
        return try! JSONDecoder().decode(PathItemRef.self, from: Data(json.utf8))
    }

    func testEachKindOpensItsOwnScreen() {
        XCTAssertEqual(PathStopRouting.destination(for: ref("lesson", "a1p2l1"), done: false), .lesson("a1p2l1"))
        XCTAssertEqual(PathStopRouting.destination(for: ref("talk", "coffee"), done: false), .talk("coffee"))
        XCTAssertEqual(PathStopRouting.destination(for: ref("campaign", "cafe", scene: 2), done: false), .campaign("cafe", scene: 2))
        XCTAssertEqual(PathStopRouting.destination(for: ref("podcast", "ep-1"), done: false), .podcastLibrary)
        XCTAssertEqual(PathStopRouting.destination(for: ref("video", "vid-1"), done: false), .video("vid-1"))
    }

    func testAVideoIsNotAPracticeDestination() {
        XCTAssertNil(PathStopRouting.practiceChoice(for: .video("vid-1"), scenarioIDs: ["coffee"], campaignSceneCounts: [:]))
    }

    func testACampaignWithoutASceneStartsAtTheFirst() {
        XCTAssertEqual(PathStopRouting.destination(for: ref("campaign", "cafe"), done: false), .campaign("cafe", scene: 0))
        XCTAssertEqual(PathStopRouting.destination(for: ref("campaign", "cafe", scene: -3), done: false), .campaign("cafe", scene: 0))
    }

    func testNothingOpensForNoReferenceADoneStopOrAnEmptyId() {
        XCTAssertNil(PathStopRouting.destination(for: nil, done: false))
        XCTAssertNil(PathStopRouting.destination(for: ref("talk", "coffee"), done: true))
        XCTAssertNil(PathStopRouting.destination(for: ref("lesson", ""), done: false))
    }

    func testAnUnknownKindIsAPodcastAsOnWebAndAndroid() {
        XCTAssertEqual(PathStopRouting.destination(for: ref("something-new", "x"), done: false), .podcastLibrary)
    }

    func testPracticeChoiceResolvesAgainstRealContent() {
        let scenarios = ["coffee", "bank"]
        let campaigns = ["cafe": 3]
        XCTAssertEqual(PathStopRouting.practiceChoice(for: .talk("bank"), scenarioIDs: scenarios, campaignSceneCounts: campaigns), .scenario("bank"))
        XCTAssertEqual(PathStopRouting.practiceChoice(for: .campaign("cafe", scene: 1), scenarioIDs: scenarios, campaignSceneCounts: campaigns), .campaign("cafe", scene: 1))
    }

    func testAStaleIdOpensNothing() {
        XCTAssertNil(PathStopRouting.practiceChoice(for: .talk("gone"), scenarioIDs: ["coffee"], campaignSceneCounts: [:]))
        XCTAssertNil(PathStopRouting.practiceChoice(for: .campaign("gone", scene: 0), scenarioIDs: [], campaignSceneCounts: ["cafe": 3]))
        XCTAssertNil(PathStopRouting.practiceChoice(for: .campaign("cafe", scene: 0), scenarioIDs: [], campaignSceneCounts: ["cafe": 0]))
    }

    func testASceneIndexPastTheEndIsClampedToTheLastScene() {
        XCTAssertEqual(PathStopRouting.practiceChoice(for: .campaign("cafe", scene: 9), scenarioIDs: [], campaignSceneCounts: ["cafe": 3]), .campaign("cafe", scene: 2))
    }

    func testLessonsAndThePodcastLibraryAreNotPracticeDestinations() {
        XCTAssertNil(PathStopRouting.practiceChoice(for: .lesson("a"), scenarioIDs: ["a"], campaignSceneCounts: ["a": 2]))
        XCTAssertNil(PathStopRouting.practiceChoice(for: .podcastLibrary, scenarioIDs: [], campaignSceneCounts: [:]))
    }
}
