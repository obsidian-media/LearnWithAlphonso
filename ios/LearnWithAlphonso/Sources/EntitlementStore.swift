import Foundation
import Observation
import LearnWithAlphonsoKit

/// The app's observable view of `EntitlementController` (Kit), where every rule lives and
/// is tested. Pro-gated views read `isPro`; the paywall reads `state` and `presentation`.
/// Nothing here touches RevenueCat. `RevenueCatPurchases` is the only adapter.
@Observable
@MainActor
final class EntitlementStore: EntitlementResetting {
    private(set) var state = EntitlementState()

    var isPro: Bool { state.isPro }
    var presentation: PaywallPresentation { state.presentation }

    @ObservationIgnored private let controller: EntitlementController
    @ObservationIgnored private var hasStarted = false

    /// `provider` is nil when no RevenueCat key resolved this launch (AppConfig.revenueCatAPIKey):
    /// the paywall then shows its retryable failure state and Pro stays off.
    init(provider: (any PurchasesProviding)?) {
        controller = EntitlementController(provider: provider)
        controller.onChange = { [weak self] in self?.state = $0 }
    }

    /// Call once, after `Purchases.configure` (LearnWithAlphonsoApp's root `.task`).
    func start() async {
        guard !hasStarted else { return }
        hasStarted = true
        controller.startListening()
        await controller.refresh()
    }

    func refresh() async { await controller.refresh() }
    func login(userID: String) async { await controller.login(userID: userID) }
    func loadOffering() async { await controller.loadOffering() }
    func purchase() async { await controller.purchase() }
    func restorePurchases() async { await controller.restore() }

    /// SessionLifecycle handler (AccountDataCleanup.HandlerID.entitlements).
    func reset() async { await controller.reset() }
}
