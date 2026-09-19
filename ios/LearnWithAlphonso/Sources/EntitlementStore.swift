import Foundation
import Observation
import RevenueCat

/// Single source of truth for "does this user have the Pro subscription"
/// (currently: Hector/Cloud Voice access) -- every Pro-gated view reads
/// only `isPro`/`packages`, never touches `Purchases` directly, so this is
/// the only place that would need to change if the entitlement/purchase
/// backend ever changed. `Purchases.configure` happens once, in
/// LearnWithAlphonsoApp's init.
@Observable
@MainActor
final class EntitlementStore {
    private(set) var isPro = false
    /// Purchasable packages for the Pro offering, once fetched -- empty
    /// until `loadOffering()` succeeds. A RevenueCat "Test Store" key has
    /// no real offering configured yet, so an empty result here is
    /// expected right now, not an error: the paywall shows a clear
    /// "not available yet" state instead of crashing or hiding silently.
    private(set) var packages: [Package] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    func refresh() async {
        do {
            let customerInfo = try await Purchases.shared.customerInfo()
            isPro = customerInfo.entitlements[AppConfig.proEntitlementID]?.isActive == true
        } catch {
            // Entitlement checks fail closed -- a network hiccup here must
            // never accidentally grant Pro access.
            isPro = false
        }
    }

    func loadOffering() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let offerings = try await Purchases.shared.offerings()
            packages = offerings.current?.availablePackages ?? []
        } catch {
            packages = []
            errorMessage = "Couldn't load subscription options. Try again later."
        }
    }

    func purchase(_ package: Package) async {
        errorMessage = nil
        do {
            let result = try await Purchases.shared.purchase(package: package)
            isPro = result.customerInfo.entitlements[AppConfig.proEntitlementID]?.isActive == true
        } catch {
            errorMessage = "Purchase couldn't be completed. Please try again."
        }
    }

    func restorePurchases() async {
        errorMessage = nil
        do {
            let customerInfo = try await Purchases.shared.restorePurchases()
            isPro = customerInfo.entitlements[AppConfig.proEntitlementID]?.isActive == true
        } catch {
            errorMessage = "Couldn't restore purchases. Please try again."
        }
    }
}
