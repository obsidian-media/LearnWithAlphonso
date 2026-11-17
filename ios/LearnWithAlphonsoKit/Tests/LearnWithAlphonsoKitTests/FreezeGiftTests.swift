import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

/// The gift action's mapping from the database's answer to a state and a sentence, the row's button, and the
/// requests it makes. Mirrors src/lib/freeze-gift.test.ts and the Android FreezeGiftLogicTest.
final class FreezeGiftTests: XCTestCase {
    private let supabaseURL = URL(string: "https://example.supabase.co")!

    private func makeClient(
        response: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: response)
    }

    private func jsonResponse(for url: URL, body: Any, status: Int = 200) -> (Data, URLResponse) {
        let data = try! JSONSerialization.data(withJSONObject: body)
        let http = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, http)
    }

    // MARK: - reasons and words

    func testAKnownReasonMapsToItselfAndAnythingElseToAPlainError() {
        XCTAssertEqual(GiftFreezeReason.from("recipient-full"), .recipientFull)
        XCTAssertEqual(GiftFreezeReason.from("already-gifted-today"), .alreadyGiftedToday)
        XCTAssertEqual(GiftFreezeReason.from("no-freeze"), .noFreeze)
        XCTAssertEqual(GiftFreezeReason.from("not-friends"), .notFriends)
        XCTAssertEqual(GiftFreezeReason.from("unauthenticated"), .unauthenticated)
        XCTAssertEqual(GiftFreezeReason.from("made-up"), .error)
        XCTAssertEqual(GiftFreezeReason.from(nil), .error)
        XCTAssertEqual(GiftFreezeReason.from("error"), .error)
    }

    func testEachResultReadsAsItsOwnSentenceTheSameAsTheWeb() {
        func msg(_ reason: GiftFreezeReason?, ok: Bool = false) -> String {
            FreezeGiftCopy.message(for: GiftFreezeOutcome(ok: ok, reason: reason, freezes: nil), friendName: "Bo")
        }
        XCTAssertEqual(msg(nil, ok: true), "Freeze sent to Bo.")
        XCTAssertEqual(msg(.recipientFull), "Bo already has all the freezes they can hold.")
        XCTAssertEqual(msg(.alreadyGiftedToday), "You already gifted Bo a freeze today. Try again tomorrow.")
        XCTAssertEqual(msg(.noFreeze), "You have no streak freeze to give.")
        XCTAssertEqual(msg(.notFriends), "Couldn't send a freeze to Bo.")
        XCTAssertEqual(msg(.error), "Couldn't send a freeze to Bo. Try again.")
        XCTAssertEqual(msg(.unauthenticated), "Couldn't send a freeze to Bo. Try again.")
    }

    // MARK: - the row's button

    func testTheButtonIsOfferedOnlyWithAFreezeHeldAndNoGiftToThatFriendToday() {
        let today: Set<String> = ["u2"]
        XCTAssertEqual(FreezeGiftCopy.buttonState(myFreezes: 1, giftedTodayTo: [], friendID: "u2"), .send)
        XCTAssertEqual(FreezeGiftCopy.buttonState(myFreezes: 3, giftedTodayTo: today, friendID: "u3"), .send)
        XCTAssertEqual(FreezeGiftCopy.buttonState(myFreezes: 2, giftedTodayTo: today, friendID: "u2"), .sentToday)
        XCTAssertEqual(FreezeGiftCopy.buttonState(myFreezes: 0, giftedTodayTo: [], friendID: "u2"), .noFreeze)
        // Already gifted wins over no freeze: the row says why it is off in the more specific way.
        XCTAssertEqual(FreezeGiftCopy.buttonState(myFreezes: 0, giftedTodayTo: today, friendID: "u2"), .sentToday)
        // An unknown balance offers the button; the database answers.
        XCTAssertEqual(FreezeGiftCopy.buttonState(myFreezes: nil, giftedTodayTo: [], friendID: "u2"), .send)
    }

    func testTheAccessibleNameSaysWhatTheButtonDoesOrWhyItIsOff() {
        let labels = GiftButtonState.allCases.map { FreezeGiftCopy.accessibilityLabel(friendName: "Bo", state: $0) }
        XCTAssertEqual(Set(labels).count, 3)
        XCTAssertEqual(FreezeGiftCopy.accessibilityLabel(friendName: "Bo", state: .send), "Gift a streak freeze to Bo")
        XCTAssertEqual(FreezeGiftCopy.accessibilityLabel(friendName: "Bo", state: .sentToday), "Streak freeze already sent to Bo today")
    }

    func testReceivedFreezesToastOneFriendByNameAndSeveralByCount() {
        XCTAssertEqual(FreezeGiftCopy.receivedToast(senderNames: ["Bo"]), "Bo gifted you a streak freeze!")
        XCTAssertEqual(FreezeGiftCopy.receivedToast(senderNames: ["Bo", "Cy"]), "2 friends gifted you a streak freeze!")
    }

    // MARK: - requests

    func testGiftCallsTheRpcWithOnlyTheRecipientAndMapsOk() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(for: request.url!, body: [["ok": true, "reason": NSNull(), "freezes": 1]])
        }

        let outcome = try await client.giftStreakFreeze(recipientID: "u2")

        XCTAssertEqual(outcome, GiftFreezeOutcome(ok: true, reason: nil, freezes: 1))
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/gift_streak_freeze"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(body as NSDictionary, ["_recipient": "u2"] as NSDictionary)
    }

    func testGiftMapsEachRefusalFromTheDatabase() async throws {
        let cases: [(String, GiftFreezeReason)] = [
            ("recipient-full", .recipientFull),
            ("already-gifted-today", .alreadyGiftedToday),
            ("no-freeze", .noFreeze),
            ("not-friends", .notFriends),
            ("weird", .error),
        ]
        for (raw, reason) in cases {
            let client = makeClient { request in
                self.jsonResponse(for: request.url!, body: [["ok": false, "reason": raw, "freezes": 2]])
            }
            let outcome = try await client.giftStreakFreeze(recipientID: "u2")
            XCTAssertEqual(outcome, GiftFreezeOutcome(ok: false, reason: reason, freezes: 2), raw)
        }
    }

    func testGiftThrowsOnAnUnreadableAnswerSoTheScreenShowsAPlainError() async {
        let client = makeClient { request in self.jsonResponse(for: request.url!, body: ["not": "rows"]) }
        do {
            _ = try await client.giftStreakFreeze(recipientID: "u2")
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? ProgressSyncError, .invalidPayload)
        }
    }

    func testGiftStateReadsOnlyMyOwnRowsAndTodayInUTC() async throws {
        let seen = TestCapture<[URLRequest]>([])
        let client = makeClient { request in
            seen.value.append(request)
            if request.url!.path.hasSuffix("user_progress") {
                return self.jsonResponse(for: request.url!, body: [["streak_freezes": 2]])
            }
            return self.jsonResponse(for: request.url!, body: [["recipient_id": "u2"]])
        }
        // 2026-11-17 23:30 UTC: still the 17th for the database, whatever the phone's time zone says.
        let now = Date(timeIntervalSince1970: 1_794_958_200)

        let state = await client.fetchFreezeGiftState(userID: "me", now: now)

        XCTAssertEqual(state, FreezeGiftState(freezes: 2, giftedTodayTo: ["u2"]))
        let progress = try XCTUnwrap(seen.value.first { $0.url!.path.hasSuffix("user_progress") })
        XCTAssertTrue(progress.url!.query!.contains("user_id=eq.me"))
        let sent = try XCTUnwrap(seen.value.first { $0.url!.path.hasSuffix("streak_freeze_gifts") })
        XCTAssertTrue(sent.url!.query!.contains("sender_id=eq.me"))
        XCTAssertTrue(sent.url!.query!.contains("gift_day=eq.\(HectorAllowance.utcDay(now))"))
    }

    func testAnUnreadableBalanceIsUnknownNotZeroSoTheButtonIsStillOffered() async {
        let client = makeClient { request in
            if request.url!.path.hasSuffix("user_progress") {
                return self.jsonResponse(for: request.url!, body: [] as [Int], status: 500)
            }
            return self.jsonResponse(for: request.url!, body: [] as [Int])
        }
        let state = await client.fetchFreezeGiftState(userID: "me")
        XCTAssertEqual(state, FreezeGiftState(freezes: nil, giftedTodayTo: []))
        XCTAssertEqual(FreezeGiftCopy.buttonState(myFreezes: state.freezes, giftedTodayTo: state.giftedTodayTo, friendID: "u2"), .send)
    }

    func testUnreadGiftsAreTheCallersOwnUnreadRows() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.jsonResponse(for: request.url!, body: [["id": "g1", "sender_id": "u2"], ["id": "g2"]])
        }

        let gifts = try await client.fetchUnreadFreezeGifts(userID: "me")

        XCTAssertEqual(gifts, [FreezeGift(id: "g1", senderID: "u2")])
        let query = try XCTUnwrap(captured.value?.url?.query)
        XCTAssertTrue(query.contains("recipient_id=eq.me"))
        XCTAssertTrue(query.contains("read_at=is.null"))
    }

    func testMarkGiftsReadPatchesOnlyTheGivenUnreadIdsAndNothingForAnEmptyList() async throws {
        let seen = TestCapture<[URLRequest]>([])
        let client = makeClient { request in
            seen.value.append(request)
            return self.jsonResponse(for: request.url!, body: [] as [Int])
        }

        try await client.markFreezeGiftsRead(ids: [])
        XCTAssertTrue(seen.value.isEmpty)

        try await client.markFreezeGiftsRead(ids: ["g1", "g2"])
        let request = try XCTUnwrap(seen.value.first)
        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertTrue(request.url!.path.hasSuffix("/rest/v1/streak_freeze_gifts"))
        XCTAssertTrue(request.url!.absoluteString.contains("id=in.(g1,g2)"))
        XCTAssertTrue(request.url!.query!.contains("read_at=is.null"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as! [String: Any]
        XCTAssertEqual(Set(body.keys), ["read_at"])
    }
}
