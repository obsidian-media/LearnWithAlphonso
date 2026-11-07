import XCTest
@testable import LearnWithAlphonsoKit
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class PracticeHubTests: XCTestCase {
    private func scenario(_ id: String, level: String = "Beginner") -> Scenario {
        try! JSONDecoder().decode(Scenario.self, from: Data("{\"id\":\"\(id)\",\"title\":\"Test\",\"emoji\":\"\",\"blurb\":\"\",\"level\":\"\(level)\",\"systemPrompt\":\"prompt\",\"opener\":\"Hello\"}".utf8))
    }
    private func campaign(_ id: String) -> Campaign {
        let scenes = ["a", "b", "c"].map { "{\"id\":\"\($0)\",\"title\":\"Scene\",\"systemPrompt\":\"p\",\"opener\":\"Hi \($0)\",\"minTurns\":3}" }.joined(separator: ",")
        return try! JSONDecoder().decode(Campaign.self, from: Data("{\"id\":\"\(id)\",\"title\":\"Story\",\"emoji\":\"\",\"blurb\":\"\",\"level\":\"Beginner\",\"premise\":\"p\",\"scenes\":[\(scenes)]}".utf8))
    }
    func testTheStarRuleNamesTheChatInChatMode() {
        XCTAssertEqual(PracticeHub.starRules(chat: true)[0], "Finish the chat")
        XCTAssertEqual(PracticeHub.starRules(chat: false)[0], "Finish the call")
        XCTAssertEqual(Array(PracticeHub.starRules(chat: true).dropFirst()), Array(PracticeHub.starRules.dropFirst()))
    }

    func testTodaySkipsWrittenOnlyEvenWhenSpellingIsWorst() {
        let events = [PracticeWeaknessEvent(category: "spelling", eventType: "detected", createdAt: "3"), .init(category: "spelling", eventType: "detected", createdAt: "2"), .init(category: "articles", eventType: "detected", createdAt: "1")]
        let scenarios = [scenario("airport"), scenario("coffee")]
        XCTAssertEqual(PracticeHub.today(.init(weaknessEvents: events), scenarios: scenarios), PracticePick(scenarioID: "coffee", weakSpot: "articles"))
        XCTAssertEqual(PracticeHub.today(.init(weaknessEvents: [events[0]]), scenarios: scenarios), PracticePick(scenarioID: "airport", weakSpot: nil))
    }
    func testEqualWeakSpotsKeepEventOrderAndClosedSpotsAreSkipped() {
        let events: [PracticeWeaknessEvent] = [.init(category: "prepositions", eventType: "detected", createdAt: "1"), .init(category: "articles", eventType: "detected", createdAt: "1")]
        let scenarios = [scenario("coffee"), scenario("airport")]
        XCTAssertEqual(PracticeHub.today(.init(weaknessEvents: events), scenarios: scenarios)?.scenarioID, "airport")
        let closed = events + [PracticeWeaknessEvent(category: "prepositions", eventType: "resolved", createdAt: "2")]
        XCTAssertEqual(PracticeHub.today(.init(weaknessEvents: closed), scenarios: scenarios)?.scenarioID, "coffee")
    }
    func testStarsDisplayedAreServerAwardEvenWhenCountsAndBestSuggestThree() throws {
        let r = try JSONDecoder().decode(PracticeResult.self, from: Data(Self.resultJSON.utf8))
        XCTAssertEqual(r.displayedStars, 1)
        XCTAssertEqual(r.retryLabel, "Try for 2")
        XCTAssertEqual(PracticeHub.starLabel(r.displayedStars), "1 of 3 stars")
        XCTAssertEqual(PracticeHub.stars([.init(kind: "scene", itemKey: "coffee", bestStars: 3, lastPlayedAt: "1"), .init(kind: "scenario", itemKey: "coffee", bestStars: 2, lastPlayedAt: "1")], kind: "scenario", key: "coffee"), 2)
    }
    func testContinueMostRecentUnfinishedCampaignFirstUnstarredScene() {
        let rows: [PracticeStarRow] = [
            .init(kind: "scene", itemKey: "older/a", bestStars: 3, lastPlayedAt: "1"),
            .init(kind: "scene", itemKey: "new/a", bestStars: 1, lastPlayedAt: "8"),
            .init(kind: "scene", itemKey: "new/c", bestStars: 3, lastPlayedAt: "7"),
            .init(kind: "scenario", itemKey: "coffee", bestStars: 3, lastPlayedAt: "9")]
        let campaigns = [campaign("older"), campaign("new")]
        XCTAssertEqual(PracticeHub.resume(rows, campaigns: campaigns), PracticeContinue(campaignID: "new", sceneIndex: 1))
        let point = PracticeHub.resume(rows, campaigns: campaigns)!
        let snapshot = PracticeHub.start(campaigns[1], sceneIndex: point.sceneIndex)
        XCTAssertEqual(snapshot.sceneIndex, 1)
        XCTAssertEqual(snapshot.sceneIndex(ofTurnAt: 0), 1)
        XCTAssertEqual(snapshot.pendingOpener, campaigns[1].scenes[1].opener)
        let completed = rows + [PracticeStarRow(kind: "scene", itemKey: "new/b", bestStars: 1, lastPlayedAt: "10")]
        XCTAssertEqual(PracticeHub.resume(completed, campaigns: campaigns), PracticeContinue(campaignID: "older", sceneIndex: 1))
        XCTAssertEqual(PracticeHub.nextScene(campaigns[1], rows: completed), 0)
    }
    func testChipsAndLevelPickDoNotLockAdvancedAndPreferLeastStarred() {
        let scenarios = [scenario("coffee"), scenario("airport"), scenario("debate", level: "Advanced")]
        XCTAssertEqual(PracticeHub.filtered(scenarios, level: "All").count, 3)
        XCTAssertEqual(PracticeHub.filtered(scenarios, level: "Advanced").map(\.id), ["debate"])
        XCTAssertEqual(PracticeHub.today(.init(cefrLevel: "C1"), scenarios: scenarios)?.scenarioID, "debate")
        XCTAssertEqual(PracticeHub.today(.init(stars: [.init(kind: "scenario", itemKey: "coffee", bestStars: 2, lastPlayedAt: "1")]), scenarios: scenarios)?.scenarioID, "airport")
    }
    func testFinishPostsOnlyCallIDAndChatCarriesIt() async throws {
        let client = AIConversationClient(baseURL: URL(string: "https://example.test")!, accessToken: { "token" }, requester: { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            XCTAssertEqual(body["callId"] as? String, "random-call")
            let isFinish = request.url!.path == "/api/practice"
            if isFinish { XCTAssertEqual(Set(body.keys), ["callId"]) }
            let text = isFinish ? Self.resultJSON : "{\"content\":\"Reply\",\"verdict\":\"correct\"}"
            return (Data(text.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        _ = try await client.chatReply(messages: [.init(role: "user", content: "Hi")], systemPrompt: "p", callId: "random-call")
        let result = try await client.finishPractice(callId: "random-call")
        XCTAssertEqual(result.displayedStars, 1)
    }
    func testSlipHiddenWhenEveryReplyRight() throws {
        let clean = try JSONDecoder().decode(PracticeResult.self, from: Data("{\"kind\":\"scenario\",\"itemKey\":\"coffee\",\"stars\":3,\"bestBefore\":0,\"bestAfter\":3,\"replies\":8,\"rightReplies\":8,\"shortReplies\":0,\"englishReplies\":0,\"finishMinReplies\":3}".utf8))
        XCTAssertNil(clean.slipToShow((said: "Soy cansado", reply: "Estoy cansado")))
        let slipped = try JSONDecoder().decode(PracticeResult.self, from: Data(Self.resultJSON.replacingOccurrences(of: "\"rightReplies\":5", with: "\"rightReplies\":4").utf8))
        XCTAssertNotNil(slipped.slipToShow((said: "a", reply: "b")))
    }
    static let resultJSON = "{\"kind\":\"scenario\",\"itemKey\":\"coffee\",\"stars\":1,\"bestBefore\":3,\"bestAfter\":3,\"replies\":5,\"rightReplies\":5,\"shortReplies\":0,\"englishReplies\":0,\"finishMinReplies\":3}"
}
