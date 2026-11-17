import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

private final class MemoryStore: ReferralCodeStore, @unchecked Sendable {
    var kept: (code: String, at: Date)?
    func load() -> (code: String, at: Date)? { kept }
    func save(code: String, at: Date) { kept = (code, at) }
    func clear() { kept = nil }
}

private final class CallCounter: @unchecked Sendable {
    var codes: [String] = []
}

final class ReferralTests: XCTestCase {
    private let base = URL(string: "https://learn.alphonsoecosystem.app")!
    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    // MARK: link

    func testTheInviteLinkIsBuiltFromTheLearnersCode() {
        XCTAssertEqual(ReferralLink.link(base: base, code: "29d081151d67"), "https://learn.alphonsoecosystem.app/?ref=29d081151d67")
    }

    func testTheLinkTrimsTrailingSlashesAndEncodesBase64Characters() {
        XCTAssertEqual(
            ReferralLink.link(base: URL(string: "https://learn.alphonsoecosystem.app/")!, code: "a+b/c="),
            "https://learn.alphonsoecosystem.app/?ref=a%2Bb%2Fc%3D")
    }

    func testTheBuiltLinkReadsBackToTheSameCode() {
        for code in ["29d081151d67", "a+b/c=", "Zx9_ab-q"] {
            let link = ReferralLink.link(base: base, code: code)
            XCTAssertEqual(ReferralLink.code(from: URL(string: link)!), code, code)
            XCTAssertEqual(ReferralLink.code(fromEntry: link), code, code)
        }
    }

    func testOnlyOurHostsReferralLinkYieldsACode() {
        XCTAssertNil(ReferralLink.code(from: URL(string: "https://evil.example/?ref=29d081151d67")!))
        XCTAssertNil(ReferralLink.code(from: URL(string: "http://learn.alphonsoecosystem.app/?ref=29d081151d67")!))
        XCTAssertNil(ReferralLink.code(from: URL(string: "https://learn.alphonsoecosystem.app/")!))
        XCTAssertNil(ReferralLink.code(from: URL(string: "https://learn.alphonsoecosystem.app/?ref=a")!))
        XCTAssertNil(ReferralLink.code(from: URL(string: "https://learn.alphonsoecosystem.app/?ref=a%20b%3Cscript%3E")!))
    }

    func testATypedEntryIsABareCodeOrALinkAndNothingElse() {
        XCTAssertEqual(ReferralLink.code(fromEntry: "  29d081151d67 \n"), "29d081151d67")
        XCTAssertNil(ReferralLink.code(fromEntry: ""))
        XCTAssertNil(ReferralLink.code(fromEntry: "hi there"))
        XCTAssertNil(ReferralLink.code(fromEntry: "https://evil.example/?ref=29d081151d67"))
    }

    // MARK: summary

    private func row(_ status: String, capped: Bool = false, at: Date? = nil) -> ReferralRow {
        ReferralRow(status: status, capped: capped, completedAt: at)
    }

    func testTheCountsCoverCompletedPendingAndTheMonthsRewards() {
        let s = ReferralSummary.summarize([
            row("completed", at: now), row("completed", at: now.addingTimeInterval(-3600)),
            row("completed", capped: true, at: now), row("pending"), row("other"),
        ], now: now)
        XCTAssertEqual(s, ReferralSummary(completed: 3, pending: 1, rewardedThisMonth: 2))
    }

    func testARewardFromLastMonthDoesNotCountTowardThisMonthsCap() {
        // now is 2026-09-21; a completion on 2026-08-31 23:59 UTC is last month.
        let monthStart = Date(timeIntervalSince1970: 1_788_220_800) // 2026-09-01T00:00:00Z
        let s = ReferralSummary.summarize(
            [row("completed", at: monthStart.addingTimeInterval(-60)), row("completed", at: monthStart)],
            now: monthStart.addingTimeInterval(20 * 86_400))
        XCTAssertEqual(s.completed, 2)
        XCTAssertEqual(s.rewardedThisMonth, 1)
    }

    func testTheCapIsReachedAtTwentyRewardedAndNotBefore() {
        let nineteen = ReferralSummary(completed: 19, pending: 0, rewardedThisMonth: 19)
        let twenty = ReferralSummary(completed: 25, pending: 0, rewardedThisMonth: 20)
        XCTAssertFalse(nineteen.capReached)
        XCTAssertEqual(nineteen.rewardsLeft, 1)
        XCTAssertTrue(twenty.capReached)
        XCTAssertEqual(twenty.rewardsLeft, 0)
        XCTAssertEqual(ReferralSummary(completed: 0, pending: 0, rewardedThisMonth: 99).rewardsLeft, 0)
        XCTAssertEqual(ReferralConstants.monthlyCap, 20)
    }

    func testTheCountLineMatchesTheWeb() {
        XCTAssertEqual(ReferralSummary(completed: 0, pending: 0, rewardedThisMonth: 0).countLine, "No friends have finished a first lesson yet.")
        XCTAssertEqual(ReferralSummary(completed: 1, pending: 0, rewardedThisMonth: 1).countLine, "1 friend joined and finished a first lesson.")
        XCTAssertEqual(ReferralSummary(completed: 2, pending: 3, rewardedThisMonth: 2).countLine, "2 friends joined and finished a first lesson. 3 still to start.")
        XCTAssertEqual(ReferralSummary(completed: 1, pending: 0, rewardedThisMonth: 1).rewardsLeftLine, "19 of 20 rewards left this month.")
    }

    // MARK: capture + claim once

    func testTheFirstCapturedCodeWinsAndIsPersisted() {
        let store = MemoryStore()
        ReferralPending.capture("first1234", store: store, now: now)
        ReferralPending.capture("second99", store: store, now: now.addingTimeInterval(5))
        XCTAssertEqual(ReferralPending.read(store: store, now: now), "first1234")
    }

    func testABadCodeIsNeverKept() {
        let store = MemoryStore()
        ReferralPending.capture("x", store: store, now: now)
        ReferralPending.capture(nil, store: store, now: now)
        ReferralPending.capture("a b<c>", store: store, now: now)
        XCTAssertNil(store.kept)
    }

    func testACodeOlderThanThirtyDaysIsForgottenAndTheClockGoingBackwardsToo() {
        let store = MemoryStore()
        store.kept = ("abcd1234", now)
        XCTAssertEqual(ReferralPending.read(store: store, now: now.addingTimeInterval(ReferralConstants.keepSeconds - 1)), "abcd1234")
        XCTAssertNil(ReferralPending.read(store: store, now: now.addingTimeInterval(ReferralConstants.keepSeconds + 1)))
        XCTAssertNil(store.kept)
        store.kept = ("abcd1234", now)
        XCTAssertNil(ReferralPending.read(store: store, now: now.addingTimeInterval(-3600)))
    }

    func testTheCapturedCodeIsClaimedOnceAfterSignupAndThenGone() async {
        let store = MemoryStore()
        ReferralPending.capture("abcd1234", store: store, now: now)
        let calls = CallCounter()
        let first = await ReferralPending.claimPending(store: store, claim: { calls.codes.append($0); return .claimed }, now: now)
        let second = await ReferralPending.claimPending(store: store, claim: { calls.codes.append($0); return .claimed }, now: now)
        XCTAssertEqual(first, .claimed)
        XCTAssertEqual(second, .none)
        XCTAssertEqual(calls.codes, ["abcd1234"])
        XCTAssertNil(store.kept)
    }

    func testNothingIsSentWhenNoCodeWasCaptured() async {
        let calls = CallCounter()
        let outcome = await ReferralPending.claimPending(store: MemoryStore(), claim: { calls.codes.append($0); return .claimed })
        XCTAssertEqual(outcome, .none)
        XCTAssertTrue(calls.codes.isEmpty)
    }

    func testEveryRealRefusalIsFinalAndClearsTheCodeSoItIsNotRetried() async {
        for reason in ReferralClaimReason.allCases {
            let store = MemoryStore()
            store.kept = ("abcd1234", now)
            let calls = CallCounter()
            let outcome = await ReferralPending.claimPending(store: store, claim: { calls.codes.append($0); return .refused(reason) }, now: now)
            XCTAssertEqual(outcome, .refused, reason.rawValue)
            XCTAssertNil(store.kept, reason.rawValue)
            let again = await ReferralPending.claimPending(store: store, claim: { calls.codes.append($0); return .claimed }, now: now)
            XCTAssertEqual(again, .none)
            XCTAssertEqual(calls.codes.count, 1, reason.rawValue)
        }
    }

    func testAnUnexplainedErrorKeepsTheCodeForTheNextLaunch() async {
        let store = MemoryStore()
        store.kept = ("abcd1234", now)
        let outcome = await ReferralPending.claimPending(store: store, claim: { _ in .error }, now: now)
        XCTAssertEqual(outcome, .retryLater)
        XCTAssertEqual(store.kept?.code, "abcd1234")
    }

    // MARK: manual fallback

    func testTheManualFieldCallsClaimReferralWithTheTypedCode() async {
        let store = MemoryStore()
        let calls = CallCounter()
        let result = await ReferralPending.claimManual(" abcd1234 ", store: store, claim: { calls.codes.append($0); return .claimed })
        XCTAssertEqual(result, .claimed)
        XCTAssertEqual(calls.codes, ["abcd1234"])
    }

    func testTheManualFieldAcceptsAPastedReferralLink() async {
        let calls = CallCounter()
        _ = await ReferralPending.claimManual(
            "https://learn.alphonsoecosystem.app/?ref=abcd1234", store: MemoryStore(), claim: { calls.codes.append($0); return .claimed })
        XCTAssertEqual(calls.codes, ["abcd1234"])
    }

    func testAMalformedManualEntryIsRefusedWithoutCallingTheServer() async {
        let calls = CallCounter()
        let result = await ReferralPending.claimManual("nope nope", store: MemoryStore(), claim: { calls.codes.append($0); return .claimed })
        XCTAssertEqual(result, .refused(.unknownCode))
        XCTAssertTrue(calls.codes.isEmpty)
    }

    func testAFinalManualAnswerClearsACapturedCodeSoItIsNeverClaimedTwice() async {
        let store = MemoryStore()
        store.kept = ("capture1234", now)
        _ = await ReferralPending.claimManual("abcd1234", store: store, claim: { _ in .refused(.alreadyReferred) })
        XCTAssertNil(store.kept)
        let calls = CallCounter()
        let outcome = await ReferralPending.claimPending(store: store, claim: { calls.codes.append($0); return .claimed }, now: now)
        XCTAssertEqual(outcome, .none)
        XCTAssertTrue(calls.codes.isEmpty)
    }

    func testAManualErrorKeepsACapturedCode() async {
        let store = MemoryStore()
        store.kept = ("capture1234", now)
        let result = await ReferralPending.claimManual("abcd1234", store: store, claim: { _ in .error })
        XCTAssertEqual(result, .error)
        XCTAssertNotNil(store.kept)
    }

    // MARK: the RPC

    private let supabaseURL = URL(string: "https://example.supabase.co")!

    private func makeClient(_ respond: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)) -> ProgressSyncClient {
        ProgressSyncClient(supabaseURL: supabaseURL, anonKey: "publishable-key", accessToken: "user-access-token", requester: respond)
    }

    private func json(_ url: URL, _ body: Any, status: Int = 200) -> (Data, URLResponse) {
        (try! JSONSerialization.data(withJSONObject: body), HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    func testClaimReferralPostsTheCodeToTheRpcAndReadsTheAnswer() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.json(request.url!, [["ok": true, "reason": NSNull()]])
        }
        let result = await client.claimReferral(code: "abcd1234")
        XCTAssertEqual(result, .claimed)
        let request = try XCTUnwrap(captured.value)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(request.url!.absoluteString.hasSuffix("/rest/v1/rpc/claim_referral"))
        let body = try XCTUnwrap(request.httpBody)
        XCTAssertEqual(try JSONSerialization.jsonObject(with: body) as? [String: String], ["_code": "abcd1234"])
    }

    func testClaimReferralMapsEachServerReason() async {
        for reason in ReferralClaimReason.allCases {
            let client = makeClient { self.json($0.url!, [["ok": false, "reason": reason.rawValue]]) }
            let result = await client.claimReferral(code: "abcd1234")
            XCTAssertEqual(result, .refused(reason))
        }
    }

    func testClaimReferralIsAnErrorForAServerFailureAnOddAnswerOrAThrow() async {
        let failing = makeClient { self.json($0.url!, ["message": "boom"], status: 500) }
        let odd = makeClient { self.json($0.url!, [["ok": false, "reason": "something-new"]]) }
        let empty = makeClient { self.json($0.url!, [[String: Any]]()) }
        let thrown = makeClient { _ in throw URLError(.notConnectedToInternet) }
        let results = [
            await failing.claimReferral(code: "abcd1234"), await odd.claimReferral(code: "abcd1234"),
            await empty.claimReferral(code: "abcd1234"), await thrown.claimReferral(code: "abcd1234"),
        ]
        XCTAssertEqual(results, [.error, .error, .error, .error])
    }

    func testReferralRowsAreReadForTheReferrerOnly() async throws {
        let captured = TestCapture<URLRequest?>(nil)
        let client = makeClient { request in
            captured.value = request
            return self.json(request.url!, [
                ["status": "completed", "capped": false, "completed_at": "2026-11-20T10:00:00.123456+00:00"],
                ["status": "pending", "capped": false, "completed_at": NSNull()],
            ])
        }
        let rows = try await client.fetchReferralRows(referrerID: "u-1")
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[0].status, "completed")
        XCTAssertNotNil(rows[0].completedAt)
        XCTAssertNil(rows[1].completedAt)
        let url = try XCTUnwrap(captured.value?.url?.absoluteString)
        XCTAssertTrue(url.contains("/rest/v1/referrals"))
        XCTAssertTrue(url.contains("referrer_id=eq.u-1"))
    }
}
