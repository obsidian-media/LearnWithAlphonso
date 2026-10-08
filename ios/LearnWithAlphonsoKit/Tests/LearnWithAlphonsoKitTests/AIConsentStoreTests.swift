import XCTest
@testable import LearnWithAlphonsoKit

@MainActor
private final class FakeConsentBackend: AIConsentBackend {
    var userID: String? = "user-a"
    var serverValue: Date?
    var fetchError: Error?
    var setError: Error?
    var onFetch: (() -> Void)?
    /// Runs after the server's value was read and before it is returned: a decision made here makes that value stale.
    var duringFetch: (() async -> Void)?
    /// Runs inside the write, before it answers.
    var duringSet: (() -> Void)?
    private(set) var setCalls: [Bool] = []
    private(set) var fetchCount = 0
    let stamp = Date(timeIntervalSince1970: 1_800_000_000)

    func currentUserID() -> String? { userID }
    func fetchConsent() async throws -> Date? {
        fetchCount += 1
        onFetch?()
        let value = serverValue
        await duringFetch?()
        if let fetchError { throw fetchError }
        return value
    }
    func setConsent(_ granted: Bool) async throws -> Date? {
        setCalls.append(granted)
        duringSet?()
        if let setError { throw setError }
        serverValue = granted ? stamp : nil
        return serverValue
    }
}

private struct Offline: Error {}

final class AIConsentStoreTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: #file)
        defaults.removePersistentDomain(forName: #file)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: #file)
        defaults = nil
        super.tearDown()
    }

    /// Granted on the web, fresh iOS install. No prompt, AI works, nothing written.
    @MainActor
    func testConsentGrantedOnAnotherDeviceOpensTheGateWithAnEmptyCache() async {
        let backend = FakeConsentBackend()
        backend.serverValue = Date(timeIntervalSince1970: 1_790_000_000)
        let store = AIConsentStore(backend: backend, defaults: defaults)
        XCTAssertFalse(store.isResolved)
        XCTAssertFalse(store.isGranted)
        XCTAssertEqual(store.status, .loading)

        await store.refresh()

        XCTAssertTrue(store.isResolved)
        XCTAssertTrue(store.isGranted)
        XCTAssertEqual(store.status, .granted)
        XCTAssertEqual(store.grantedAt, backend.serverValue)
        XCTAssertEqual(backend.setCalls, [])
        XCTAssertTrue(AIDisclosureGate.isAcknowledged(in: defaults), "the device mirror other views read is open")
    }

    @MainActor
    func testNeverConsentedStaysOffAndWritesNothing() async {
        let backend = FakeConsentBackend()
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        XCTAssertTrue(store.isResolved)
        XCTAssertFalse(store.isGranted)
        XCTAssertEqual(store.status, .denied)
        XCTAssertEqual(backend.setCalls, [])
        XCTAssertFalse(AIDisclosureGate.isAcknowledged(in: defaults))
    }

    /// A failed read must be a retry state, never "AI is off": the learner may well have consented.
    @MainActor
    func testAFailedReadIsUnavailableNeverDenied() async {
        let backend = FakeConsentBackend()
        backend.fetchError = Offline()
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        XCTAssertEqual(store.status, .unavailable)
        XCTAssertNotEqual(store.status, .denied)

        backend.fetchError = nil
        backend.serverValue = backend.stamp
        await store.refresh()
        XCTAssertEqual(store.status, .granted)
    }

    @MainActor
    func testAFailedReadAfterAKnownDenialIsStillUnavailable() async {
        let backend = FakeConsentBackend()
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        XCTAssertEqual(store.status, .denied)
        backend.fetchError = Offline()
        await store.refresh()
        XCTAssertEqual(store.status, .unavailable, "a stale 'no' must not be shown as the account's truth")
    }

    @MainActor
    func testLegacyLocalAcknowledgementIsSyncedOnce() async throws {
        AIDisclosureGate.acknowledge(in: defaults)
        let backend = FakeConsentBackend()
        let store = AIConsentStore(backend: backend, defaults: defaults)

        await store.refresh()
        XCTAssertEqual(backend.setCalls, [true])
        XCTAssertTrue(store.isGranted)

        await store.refresh()
        XCTAssertEqual(backend.setCalls, [true], "not re-sent")

        try await store.set(false)
        await store.refresh()
        XCTAssertEqual(backend.setCalls, [true, false], "a withdrawal is never undone by the old local flag")
        XCTAssertFalse(store.isGranted)
    }

    @MainActor
    func testLegacyAcknowledgementIsNotGivenToTheNextAccountOnTheDevice() async {
        AIDisclosureGate.acknowledge(in: defaults)
        let backend = FakeConsentBackend()
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        XCTAssertEqual(backend.setCalls, [true])

        backend.userID = "user-b"
        backend.serverValue = nil
        await store.refresh()

        XCTAssertEqual(backend.setCalls, [true])
        XCTAssertFalse(store.isGranted)
        XCTAssertFalse(AIDisclosureGate.isAcknowledged(in: defaults))
    }

    @MainActor
    func testLegacyAcknowledgementSurvivesAFailedSync() async {
        AIDisclosureGate.acknowledge(in: defaults)
        let backend = FakeConsentBackend()
        backend.setError = Offline()
        let store = AIConsentStore(backend: backend, defaults: defaults)

        await store.refresh()
        XCTAssertTrue(store.lastRefreshFailed)
        XCTAssertTrue(AIDisclosureGate.isAcknowledged(in: defaults), "the pre-update choice is kept for the retry")

        backend.setError = nil
        await store.refresh()
        XCTAssertEqual(backend.setCalls, [true, true])
        XCTAssertTrue(store.isGranted)
    }

    @MainActor
    func testOfflineFallsBackToThisAccountsCachedConsent() async {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        await AIConsentStore(backend: backend, defaults: defaults).refresh()

        backend.fetchError = Offline()
        let relaunched = AIConsentStore(backend: backend, defaults: defaults)
        XCTAssertTrue(relaunched.isResolved)
        XCTAssertTrue(relaunched.isGranted)
        await relaunched.refresh()
        XCTAssertTrue(relaunched.isGranted)
        XCTAssertTrue(relaunched.lastRefreshFailed)
        XCTAssertEqual(relaunched.status, .granted)
    }

    @MainActor
    func testCacheIsPerAccount() async {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()

        backend.userID = "user-b"
        backend.fetchError = Offline()
        await store.refresh()
        XCTAssertFalse(store.isGranted)
        XCTAssertFalse(store.isResolved)
        XCTAssertEqual(store.status, .unavailable)
    }

    @MainActor
    func testWithdrawClearsImmediately() async throws {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()

        try await store.set(false)

        XCTAssertFalse(store.isGranted)
        XCTAssertFalse(AIDisclosureGate.isAcknowledged(in: defaults))
        backend.fetchError = Offline()
        let relaunched = AIConsentStore(backend: backend, defaults: defaults)
        XCTAssertTrue(relaunched.isResolved)
        XCTAssertFalse(relaunched.isGranted)
    }

    @MainActor
    func testFailedWithdrawKeepsStateAndThrows() async {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        backend.setError = Offline()
        do {
            try await store.set(false)
            XCTFail("expected an error")
        } catch {}
        XCTAssertTrue(store.isGranted)
    }

    @MainActor
    func testSignedOutIsNotGranted() async {
        let backend = FakeConsentBackend()
        backend.userID = nil
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        XCTAssertFalse(store.isGranted)
        do {
            try await store.set(true)
            XCTFail("expected signedOut")
        } catch {
            XCTAssertEqual(error as? AIConsentError, .signedOut)
        }
    }

    @MainActor
    func testAccountSwitchMidRefreshDoesNotLeakConsent() async {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        backend.onFetch = { backend.userID = "user-b" }
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        XCTAssertFalse(store.isGranted)
    }

    /// A 403 ai-consent-required from any AI call closes the gate at once, without the screen's help.
    @MainActor
    func testAServerRefusalForConsentClosesTheGateImmediately() async {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        XCTAssertTrue(store.isGranted)

        // Withdrawn on another device: the server now has nothing.
        backend.serverValue = nil
        AIConsentSignal.noteIfConsentRequired(status: 403, message: "ai-consent-required")
        await Task.yield()
        for _ in 0..<50 where store.isGranted { await Task.yield() }

        XCTAssertFalse(store.isGranted)
        XCTAssertEqual(store.status, .denied)
    }

    @MainActor
    func testOtherErrorsDoNotTouchConsent() async {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        let fetchesBefore = backend.fetchCount

        AIConsentSignal.noteIfConsentRequired(status: 503, message: "consent-check-failed")
        AIConsentSignal.noteIfConsentRequired(status: 403, message: "not-entitled")
        AIConsentSignal.noteIfConsentRequired(status: 403, message: nil)
        for _ in 0..<20 { await Task.yield() }

        XCTAssertTrue(store.isGranted)
        XCTAssertEqual(backend.fetchCount, fetchesBefore)
    }

    // MARK: ordering of reads and decisions

    /// A slow read that began before the learner withdrew must not switch consent back on.
    @MainActor
    func testAStaleReadCannotUndoAWithdrawal() async {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        let store = AIConsentStore(backend: backend, defaults: defaults)
        backend.duringFetch = { try? await store.set(false) }

        await store.refresh()

        XCTAssertFalse(store.isGranted)
        XCTAssertEqual(store.status, .denied)
        XCTAssertFalse(AIDisclosureGate.isAcknowledged(in: defaults), "the device mirror stays off too")
    }

    @MainActor
    func testAStaleReadCannotUndoAGrant() async {
        let backend = FakeConsentBackend()
        let store = AIConsentStore(backend: backend, defaults: defaults)
        backend.duringFetch = { try? await store.set(true) }

        await store.refresh()

        XCTAssertTrue(store.isGranted)
        XCTAssertEqual(store.status, .granted)
    }

    @MainActor
    func testAStaleFailedReadDoesNotMarkTheDecisionUnavailable() async {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        let store = AIConsentStore(backend: backend, defaults: defaults)
        backend.fetchError = Offline()
        backend.duringFetch = { try? await store.set(false) }

        await store.refresh()

        XCTAssertFalse(store.lastRefreshFailed)
        XCTAssertEqual(store.status, .denied)
    }

    /// A write that fails decided nothing, so it must not throw away the read that was in flight.
    @MainActor
    func testAFailedWriteDuringTheFirstReadDoesNotDiscardIt() async {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        let store = AIConsentStore(backend: backend, defaults: defaults)
        backend.setError = Offline()
        backend.duringFetch = { try? await store.set(false) }

        await store.refresh()

        XCTAssertEqual(store.status, .granted, "not left on .loading with no retry")
    }

    @MainActor
    func testAFailedWriteDuringAFailedReadStillOffersARetry() async {
        let backend = FakeConsentBackend()
        let store = AIConsentStore(backend: backend, defaults: defaults)
        backend.fetchError = Offline()
        backend.setError = Offline()
        backend.duringFetch = { try? await store.set(false) }

        await store.refresh()

        XCTAssertEqual(store.status, .unavailable)
    }

    @MainActor
    func testARefusalSignalDuringAReadIsNotUndoneByThatRead() async {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        XCTAssertTrue(store.isGranted)
        backend.duringFetch = {
            backend.duringFetch = nil
            backend.serverValue = nil
            AIConsentSignal.noteIfConsentRequired(status: 403, message: "ai-consent-required")
            for _ in 0..<50 { await Task.yield() }
        }
        await store.refresh()
        for _ in 0..<50 where store.isGranted { await Task.yield() }
        XCTAssertFalse(store.isGranted)
    }

    // MARK: cancellation and account changes

    @MainActor
    func testACancelledReadIsNotAFailure() async {
        let backend = FakeConsentBackend()
        let store = AIConsentStore(backend: backend, defaults: defaults)
        backend.fetchError = CancellationError()
        await store.refresh()
        XCTAssertFalse(store.lastRefreshFailed)
        XCTAssertEqual(store.status, .loading)

        backend.fetchError = URLError(.cancelled)
        await store.refresh()
        XCTAssertFalse(store.lastRefreshFailed)
        XCTAssertEqual(store.status, .loading)
    }

    @MainActor
    func testAFailureAfterTheAccountChangedIsNotRecorded() async {
        let backend = FakeConsentBackend()
        let store = AIConsentStore(backend: backend, defaults: defaults)
        backend.fetchError = Offline()
        backend.onFetch = { backend.userID = "user-b" }
        await store.refresh()
        XCTAssertFalse(store.lastRefreshFailed)
    }

    @MainActor
    func testAnotherAccountIsNeverGrantedFromTheLastOnesState() async {
        let backend = FakeConsentBackend()
        backend.serverValue = backend.stamp
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        XCTAssertTrue(store.isGranted)

        backend.userID = "user-b"  // switched, nothing read yet
        XCTAssertFalse(store.isGranted)
        XCTAssertEqual(store.status, .loading)

        backend.userID = nil  // signed out
        XCTAssertFalse(store.isGranted)
    }

    @MainActor
    func testADecisionFinishingAfterAnAccountSwitchDoesNotTouchTheNewAccount() async throws {
        let backend = FakeConsentBackend()
        let store = AIConsentStore(backend: backend, defaults: defaults)
        await store.refresh()
        XCTAssertEqual(store.status, .denied)

        // user-a's write is in flight when user-b signs in.
        backend.duringSet = { backend.userID = "user-b" }
        try await store.set(true)

        XCTAssertFalse(store.isGranted, "user-b never consented")
        XCTAssertEqual(store.status, .loading, "user-b has not been read yet")
        XCTAssertFalse(AIDisclosureGate.isAcknowledged(in: defaults), "the device mirror follows the signed-in account")
        let cached = defaults.string(forKey: AIConsentStore.cachePrefix + "user-a")
        XCTAssertNotNil(cached)
        XCTAssertNotEqual(cached, AIConsentStore.deniedMarker, "user-a's answer is kept for user-a")
    }
}
