import XCTest
@testable import LearnWithAlphonsoKit

final class EntitlementControllerTests: XCTestCase {
    private let monthly = PaywallProduct(
        id: "com.obsidianmedia.learnwithalphonso.pro.monthly", localizedTitle: "Alphonso Pro",
        localizedPriceString: "$9.99", period: BillingPeriod(unit: .month, value: 1),
        eligibleFreeTrial: BillingPeriod(unit: .week, value: 2)
    )
    private let pro = EntitlementSnapshot(isProActive: true)
    private let free = EntitlementSnapshot(isProActive: false)

    @MainActor
    private func loadedController(_ mock: MockPurchases) async -> EntitlementController {
        mock.productsResult = .success([monthly])
        let controller = EntitlementController(provider: mock)
        await controller.loadOffering()
        return controller
    }

    // MARK: - Offering states

    @MainActor
    func testStartsLoadingSoThePaywallNeverFlashesAFailure() {
        let controller = EntitlementController(provider: MockPurchases())
        XCTAssertEqual(controller.state.load, .loading)
        XCTAssertEqual(controller.state.presentation.state, .loading)
        XCTAssertFalse(controller.state.isPro)
    }

    @MainActor
    func testAnOfferingFailureOffersRetryAndRetryRecovers() async {
        let mock = MockPurchases()
        mock.productsResult = .failure(MockPurchasesError())
        let controller = EntitlementController(provider: mock)

        await controller.loadOffering()
        XCTAssertEqual(controller.state.presentation.state, .failed(message: PaywallCopy.loadFailed))
        XCTAssertEqual(controller.state.presentation.retryTitle, "Try again")

        mock.productsResult = .success([monthly])
        await controller.loadOffering()
        XCTAssertEqual(controller.state.load, .loaded([monthly]))
        XCTAssertEqual(controller.state.presentation.ctaTitle, "Start free trial")
    }

    @MainActor
    func testAnEmptyOfferingIsARetryableFailureNotABlankPaywall() async {
        let mock = MockPurchases()
        mock.productsResult = .success([])
        let controller = EntitlementController(provider: mock)
        await controller.loadOffering()
        XCTAssertEqual(controller.state.load, .failed)
    }

    @MainActor
    func testWithoutRevenueCatConfiguredTheOfferingFailsAndNothingIsCalled() async {
        let controller = EntitlementController(provider: nil)
        await controller.loadOffering()
        await controller.purchase()
        await controller.restore()
        await controller.refresh()
        XCTAssertEqual(controller.state.load, .failed)
        XCTAssertFalse(controller.state.isPro)
        XCTAssertNil(controller.state.notice)
    }

    // MARK: - Purchase outcomes

    @MainActor
    func testACompletedPurchaseUnlocksPro() async {
        let mock = MockPurchases()
        let controller = await loadedController(mock)
        mock.purchaseResult = .success(.completed(pro))
        await controller.purchase()
        XCTAssertTrue(controller.state.isPro)
        XCTAssertNil(controller.state.notice)
        XCTAssertFalse(controller.state.isPurchasing)
        XCTAssertEqual(mock.calls.last, "purchase:com.obsidianmedia.learnwithalphonso.pro.monthly")
    }

    @MainActor
    func testACancelledPurchaseIsSilent() async {
        let mock = MockPurchases()
        let controller = await loadedController(mock)
        mock.purchaseResult = .success(.cancelled)
        await controller.purchase()
        XCTAssertNil(controller.state.notice)
        XCTAssertFalse(controller.state.isPro)
        XCTAssertFalse(controller.state.isPurchasing)
    }

    @MainActor
    func testAPendingPurchaseSaysWaitingForApproval() async {
        let mock = MockPurchases()
        let controller = await loadedController(mock)
        mock.purchaseResult = .success(.pending)
        await controller.purchase()
        XCTAssertEqual(controller.state.notice, .info(PaywallCopy.pending))
        XCTAssertTrue(PaywallCopy.pending.hasPrefix("Waiting for approval"))
        XCTAssertFalse(controller.state.isPro)
    }

    @MainActor
    func testAFailedPurchaseSaysSoInWords() async {
        let mock = MockPurchases()
        let controller = await loadedController(mock)
        mock.purchaseResult = .failure(MockPurchasesError())
        await controller.purchase()
        XCTAssertEqual(controller.state.notice, .error(PaywallCopy.purchaseFailed))
        XCTAssertFalse(controller.state.isPurchasing)
    }

    @MainActor
    func testACompletedPurchaseWithoutTheEntitlementPointsToRestore() async {
        let mock = MockPurchases()
        let controller = await loadedController(mock)
        mock.purchaseResult = .success(.completed(free))
        await controller.purchase()
        XCTAssertEqual(controller.state.notice, .error(PaywallCopy.purchasedNotActive))
    }

    @MainActor
    func testPurchaseBeforeTheOfferingLoadsDoesNothing() async {
        let mock = MockPurchases()
        let controller = EntitlementController(provider: mock)
        await controller.purchase()
        XCTAssertFalse(mock.calls.contains { $0.hasPrefix("purchase:") })
    }

    // MARK: - Restore

    @MainActor
    func testRestoreWithNoEntitlementSaysNoSubscriptionFound() async {
        let mock = MockPurchases()
        mock.restoreResult = .success(free)
        let controller = EntitlementController(provider: mock)
        await controller.restore()
        XCTAssertEqual(controller.state.notice, .info("No active subscription found for this Apple Account."))
        XCTAssertFalse(controller.state.isRestoring)
    }

    @MainActor
    func testRestoreWithAnEntitlementUnlocksPro() async {
        let mock = MockPurchases()
        mock.restoreResult = .success(pro)
        let controller = EntitlementController(provider: mock)
        await controller.restore()
        XCTAssertTrue(controller.state.isPro)
        XCTAssertNil(controller.state.notice)
    }

    @MainActor
    func testRestoreFailureSaysSo() async {
        let mock = MockPurchases()
        mock.restoreResult = .failure(MockPurchasesError())
        let controller = EntitlementController(provider: mock)
        await controller.restore()
        XCTAssertEqual(controller.state.notice, .error(PaywallCopy.restoreFailed))
    }

    // MARK: - Live updates

    @MainActor
    func testAStreamedCustomerInfoUpdateFlipsProWithoutARelaunch() async {
        let mock = MockPurchases()
        let controller = EntitlementController(provider: mock)
        controller.startListening()
        XCTAssertFalse(controller.state.isPro)

        mock.emit(pro) // renewal or a purchase on another device
        await waitUntil { controller.state.isPro }

        mock.emit(free) // expiry
        await waitUntil { !controller.state.isPro }
    }

    @MainActor
    func testPendingThenApprovalViaTheStreamUnlocksPro() async {
        let mock = MockPurchases()
        let controller = await loadedController(mock)
        controller.startListening()
        mock.purchaseResult = .success(.pending)
        await controller.purchase()
        XCTAssertEqual(controller.state.notice, .info(PaywallCopy.pending))

        mock.emit(pro) // Ask to Buy approved while the app was backgrounded

        await waitUntil { controller.state.isPro }
        XCTAssertNil(controller.state.notice)
    }

    @MainActor
    func testOnChangeMirrorsEveryStateChange() async {
        let mock = MockPurchases()
        mock.customerInfoResult = .success(pro)
        let controller = EntitlementController(provider: mock)
        let seen = TestCapture<[EntitlementState]>([])
        controller.onChange = { seen.value.append($0) }
        await controller.refresh()
        XCTAssertEqual(seen.value.last?.isPro, true)
    }

    // MARK: - Identity (login catch, fail closed)

    @MainActor
    func testLoginSetsProFromTheIdentifiedAccount() async {
        let mock = MockPurchases()
        mock.logInResult = .success(pro)
        let controller = EntitlementController(provider: mock)
        await controller.login(userID: "user-a")
        XCTAssertTrue(controller.state.isPro)
    }

    @MainActor
    func testLoginFailureForTheSameIdentityRefreshesInsteadOfKeepingAStaleValue() async {
        let mock = MockPurchases()
        mock.appUserID = "user-a"
        mock.logInResult = .failure(MockPurchasesError())
        mock.customerInfoResult = .success(pro)
        let controller = EntitlementController(provider: mock)
        await controller.login(userID: "user-a")
        XCTAssertEqual(mock.calls, ["logIn:user-a", "customerInfo"])
        XCTAssertTrue(controller.state.isPro)
    }

    @MainActor
    func testLoginFailureWhileRevenueCatHoldsAnotherIdentityFailsClosed() async {
        let mock = MockPurchases()
        let controller = EntitlementController(provider: mock)
        controller.startListening()
        mock.emit(pro) // the previous account's cached Pro
        await waitUntil { controller.state.isPro }

        mock.appUserID = "user-a" // RevenueCat still holds the previous account
        mock.logInResult = .failure(MockPurchasesError())
        await controller.login(userID: "user-b")

        XCTAssertFalse(controller.state.isPro)
        XCTAssertFalse(mock.calls.contains("customerInfo"))
    }

    @MainActor
    func testARefreshErrorFailsClosed() async {
        let mock = MockPurchases()
        let controller = EntitlementController(provider: mock)
        controller.startListening()
        mock.emit(pro)
        await waitUntil { controller.state.isPro }
        mock.customerInfoResult = .failure(MockPurchasesError())
        await controller.refresh()
        XCTAssertFalse(controller.state.isPro)
    }

    // MARK: - Reset on sign-out

    @MainActor
    func testResetClearsProProductsAndNoticeAndLogsOut() async {
        let mock = MockPurchases()
        let controller = await loadedController(mock)
        mock.purchaseResult = .success(.completed(pro))
        await controller.purchase()
        XCTAssertTrue(controller.state.isPro)

        await controller.reset()

        XCTAssertEqual(controller.state, EntitlementState())
        XCTAssertEqual(controller.state.load, .loading)
        XCTAssertEqual(mock.calls.last, "logOut")
    }

    @MainActor
    func testResetWhenLogOutThrowsStillLeavesProOff() async {
        let mock = MockPurchases()
        mock.logOutResult = .failure(MockPurchasesError()) // anonymous user or offline
        let controller = EntitlementController(provider: mock)
        controller.startListening()
        mock.emit(pro)
        await waitUntil { controller.state.isPro }
        await controller.reset()
        XCTAssertFalse(controller.state.isPro)
    }

    @MainActor
    func testALoginThatResolvesAfterSignOutCannotBringBackPro() async {
        let mock = MockPurchases()
        let gate = Gate()
        mock.logInGate = gate
        mock.logInResult = .success(pro)
        let controller = EntitlementController(provider: mock)

        let login = Task { await controller.login(userID: "user-a") }
        await waitUntil { mock.calls.contains("logIn:user-a") }
        await controller.reset()
        gate.open()
        await login.value

        XCTAssertFalse(controller.state.isPro)
    }

    @MainActor
    func testStreamUpdatesDuringResetAreIgnoredAndListeningResumesAfter() async {
        let mock = MockPurchases()
        let gate = Gate()
        mock.logOutGate = gate
        let controller = EntitlementController(provider: mock)
        controller.startListening()

        let reset = Task { await controller.reset() }
        await waitUntil { mock.calls.contains("logOut") }
        mock.emit(pro) // the previous account's late update
        await drainMainActor()
        XCTAssertFalse(controller.state.isPro)

        gate.open()
        await reset.value
        mock.emit(pro) // the next account's real update
        await waitUntil { controller.state.isPro }
    }

    /// The controller registered through the real cleanup function is reset by a lifecycle event.
    @MainActor
    func testTheLifecycleResetsTheRealController() async {
        let mock = MockPurchases()
        mock.restoreResult = .success(pro)
        let controller = EntitlementController(provider: mock)
        await controller.restore()
        XCTAssertTrue(controller.state.isPro)
        let lifecycle = SessionLifecycle()
        let suite = "EntitlementControllerTests-" + UUID().uuidString
        AccountDataCleanup.register(on: lifecycle, queue: InMemoryAccountQueue(),
                                    caches: AccountLocalCaches(defaults: UserDefaults(suiteName: suite)!),
                                    clearWidget: {}, entitlements: controller)

        await lifecycle.run(.signedOut)

        XCTAssertFalse(controller.state.isPro)
        XCTAssertEqual(mock.calls.last, "logOut")
    }
}
