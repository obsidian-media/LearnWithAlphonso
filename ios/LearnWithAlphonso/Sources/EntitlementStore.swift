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

    /// False when RevenueCat wasn't configured this launch (no API key
    /// resolved -- see AppConfig.revenueCatAPIKey). Every method below must
    /// check this before touching `Purchases.shared`, which fatalErrors if
    /// accessed before `Purchases.configure` ran.
    private let isConfigured = AppConfig.revenueCatAPIKey != nil

    /// Hector re-parenting Phase 1's own prerequisite
    /// (docs/superpowers/specs/2026-09-26-hector-reparenting-design.md):
    /// aliases RevenueCat's own subscriber identity to this app's own
    /// Supabase user id, so a server endpoint can look up "is this user
    /// Pro" by that same id later (see revenuecat-entitlement.ts). Without
    /// this, RevenueCat only ever knows this install's own anonymous
    /// `$RCAnonymousID:...` -- `Purchases.configure` is never given an
    /// explicit `appUserID`, so nothing before this linked the two.
    /// Called once per sign-in/restore (RootView), not on every launch
    /// regardless of session state -- there is no user id to alias
    /// before one exists.
    ///
    /// Updates `isPro` from the result: the identified account's
    /// purchase history can genuinely differ from whatever the earlier
    /// anonymous `refresh()` found (e.g. restoring a subscription tied
    /// to this real account from another device), so this needs its own
    /// read of `customerInfo`, not just a re-run of `refresh()` after.
    func login(userID: String) async {
        guard isConfigured else { return }
        do {
            let result = try await Purchases.shared.logIn(userID)
            isPro = result.customerInfo.entitlements[AppConfig.proEntitlementID]?.isActive == true
        } catch {
            // Best-effort -- same posture as every other call in this
            // file: a failed logIn just leaves whatever isPro value the
            // earlier anonymous refresh() already found.
        }
    }

    func refresh() async {
        guard isConfigured else {
            isPro = false
            return
        }
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
        guard isConfigured else {
            packages = []
            errorMessage = "Subscriptions aren't available in this build yet."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let offerings = try await Purchases.shared.offerings()
            packages = offerings.current?.availablePackages ?? []
        } catch {
            packages = []
            // TEMPORARY debug instrumentation (2026-09-23) -- surfaces the
            // real underlying RevenueCat/StoreKit error in the UI itself,
            // since there's no Mac available to read Xcode's device
            // console for this TestFlight build. Revert to the plain
            // "Couldn't load subscription options. Try again later."
            // message once the real offerings() failure is diagnosed.
            let nsError = error as NSError
            errorMessage =
                "Couldn't load subscription options: \(nsError.domain) code \(nsError.code): \(error.localizedDescription)"
        }
    }

    func purchase(_ package: Package) async {
        guard isConfigured else {
            errorMessage = "Subscriptions aren't available in this build yet."
            return
        }
        errorMessage = nil
        do {
            let result = try await Purchases.shared.purchase(package: package)
            isPro = result.customerInfo.entitlements[AppConfig.proEntitlementID]?.isActive == true
        } catch {
            errorMessage = "Purchase couldn't be completed. Please try again."
        }
    }

    func restorePurchases() async {
        guard isConfigured else {
            errorMessage = "Subscriptions aren't available in this build yet."
            return
        }
        errorMessage = nil
        do {
            let customerInfo = try await Purchases.shared.restorePurchases()
            isPro = customerInfo.entitlements[AppConfig.proEntitlementID]?.isActive == true
        } catch {
            errorMessage = "Couldn't restore purchases. Please try again."
        }
    }
}
