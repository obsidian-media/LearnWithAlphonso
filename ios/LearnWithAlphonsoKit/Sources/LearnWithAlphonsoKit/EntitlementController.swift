import Foundation

public struct EntitlementSnapshot: Sendable, Equatable {
    public let isProActive: Bool
    public init(isProActive: Bool) { self.isProActive = isProActive }
}

public enum PurchaseOutcome: Sendable, Equatable {
    case completed(EntitlementSnapshot)
    case cancelled
    case pending
}

/// The RevenueCat calls the app makes, in Kit types. The app's `RevenueCatPurchases` is the
/// only live conformer; it maps RevenueCat's cancel and pending errors to `PurchaseOutcome`
/// so this layer never sees an SDK error code.
@MainActor
public protocol PurchasesProviding: AnyObject {
    func currentAppUserID() -> String
    func customerInfo() async throws -> EntitlementSnapshot
    func logIn(_ userID: String) async throws -> EntitlementSnapshot
    func logOut() async throws -> EntitlementSnapshot
    func currentOfferingProducts() async throws -> [PaywallProduct]
    func purchase(productID: String) async throws -> PurchaseOutcome
    func restorePurchases() async throws -> EntitlementSnapshot
    func customerInfoUpdates() -> AsyncStream<EntitlementSnapshot>
}

public struct EntitlementState: Sendable, Equatable {
    public enum Notice: Sendable, Equatable {
        case info(String)
        case error(String)
    }

    public var isPro = false
    /// Starts `.loading`: the paywall shows its skeleton, never a failure, before the first load.
    public var load: PaywallLoadState = .loading
    public var notice: Notice?
    public var isPurchasing = false
    public var isRestoring = false

    public init() {}

    public var presentation: PaywallPresentation { .make(load) }
}

/// The single source of truth for "is this account Pro" and for everything the paywall
/// shows. Entitlement checks fail closed.
///
/// `generation` goes up on every `reset()` (sign-out, account deletion). Any call that
/// started before a reset drops its result, so a slow `logIn` or `customerInfo` for the
/// previous account can never re-grant Pro to the next one.
@MainActor
public final class EntitlementController: EntitlementResetting {
    public private(set) var state = EntitlementState() {
        didSet {
            if state != oldValue { onChange?(state) }
        }
    }

    public var onChange: (@MainActor (EntitlementState) -> Void)?

    private let provider: (any PurchasesProviding)?
    private var generation = 0
    private var resetsInFlight = 0
    private var listenTask: Task<Void, Never>?
    /// The account this controller is currently identified as. Nil while signed out or
    /// before the first login. Streamed updates only count for this account.
    private var expectedUserID: String?

    private static let anonymousPrefix = "$RCAnonymousID:"

    public init(provider: (any PurchasesProviding)?) {
        self.provider = provider
    }

    /// Starts consuming RevenueCat's customer-info stream: Ask to Buy approvals, renewals,
    /// expiries and purchases made on another device all flip `isPro` with no relaunch.
    public func startListening() {
        guard let provider, listenTask == nil else { return }
        let updates = provider.customerInfoUpdates()
        listenTask = Task { [weak self] in
            for await snapshot in updates {
                guard let self else { return }
                self.applyStreamed(snapshot)
            }
        }
    }

    public func stopListening() {
        listenTask?.cancel()
        listenTask = nil
    }

    private func applyStreamed(_ snapshot: EntitlementSnapshot) {
        // While a reset is logging RevenueCat out, the stream can still deliver the previous
        // account's info. It must not land.
        guard resetsInFlight == 0 else { return }
        // No signed-in account, or RevenueCat still holds a different identity than the one
        // we logged in as: whatever it streams is not this account's entitlement.
        guard let provider, let expected = expectedUserID,
              provider.currentAppUserID() == expected else { return }
        state.isPro = snapshot.isProActive
        if snapshot.isProActive { state.notice = nil }
    }

    public func refresh() async {
        guard let provider else {
            state.isPro = false
            return
        }
        let started = generation
        do {
            let snapshot = try await provider.customerInfo()
            guard started == generation else { return }
            state.isPro = snapshot.isProActive
        } catch {
            guard started == generation else { return }
            state.isPro = false
        }
    }

    /// Aliases RevenueCat's identity to the Supabase user id. On failure this never keeps a
    /// value read for a different identity. It refreshes only when RevenueCat already holds
    /// this user; otherwise it fails closed.
    public func login(userID: String) async {
        guard let provider else { return }
        let started = generation
        expectedUserID = userID
        do {
            let snapshot = try await provider.logIn(userID)
            guard started == generation else {
                // Signed out while this was in flight: RevenueCat may now hold the old account.
                await dropIdentityIfSignedOut(provider)
                return
            }
            state.isPro = snapshot.isProActive
        } catch {
            guard started == generation else { return }
            if provider.currentAppUserID() == userID {
                await refresh()
            } else {
                state.isPro = false
            }
        }
    }

    /// Launch with no stored session: RevenueCat may still hold a previous account's
    /// identity from before an upgrade or an interrupted sign-out. Clear it, so no stale Pro
    /// can show for whoever signs in next.
    public func reconcileSignedOut() async {
        guard let provider, expectedUserID == nil,
              !provider.currentAppUserID().hasPrefix(Self.anonymousPrefix) else { return }
        await reset()
    }

    private func dropIdentityIfSignedOut(_ provider: any PurchasesProviding) async {
        guard expectedUserID == nil, resetsInFlight == 0,
              !provider.currentAppUserID().hasPrefix(Self.anonymousPrefix) else { return }
        _ = try? await provider.logOut()
    }

    public func loadOffering() async {
        guard let provider else {
            state.load = .failed
            return
        }
        let started = generation
        state.load = .loading
        do {
            let products = try await provider.currentOfferingProducts()
            guard started == generation else { return }
            state.load = products.isEmpty ? .failed : .loaded(products)
        } catch {
            guard started == generation else { return }
            state.load = .failed
        }
    }

    public func purchase() async {
        guard let provider, !state.isPurchasing,
              let productID = state.presentation.productID else { return }
        let started = generation
        state.notice = nil
        state.isPurchasing = true
        defer { state.isPurchasing = false }
        do {
            let outcome = try await provider.purchase(productID: productID)
            guard started == generation else { return }
            switch outcome {
            case .completed(let snapshot):
                state.isPro = snapshot.isProActive
                if !snapshot.isProActive { state.notice = .error(PaywallCopy.purchasedNotActive) }
            case .cancelled:
                break
            case .pending:
                state.notice = .info(PaywallCopy.pending)
            }
        } catch {
            guard started == generation else { return }
            state.notice = .error(PaywallCopy.purchaseFailed)
        }
    }

    public func restore() async {
        guard let provider, !state.isRestoring else { return }
        let started = generation
        state.notice = nil
        state.isRestoring = true
        defer { state.isRestoring = false }
        do {
            let snapshot = try await provider.restorePurchases()
            guard started == generation else { return }
            state.isPro = snapshot.isProActive
            if !snapshot.isProActive { state.notice = .info(PaywallCopy.restoreEmpty) }
        } catch {
            guard started == generation else { return }
            state.notice = .error(PaywallCopy.restoreFailed)
        }
    }

    /// Sign-out and account deletion: Pro off, products and trial eligibility dropped, the
    /// paywall back to its loading state, and RevenueCat logged out to a fresh anonymous id.
    public func reset() async {
        generation += 1
        expectedUserID = nil
        resetsInFlight += 1
        defer { resetsInFlight -= 1 }
        state = EntitlementState()
        guard let provider else { return }
        let started = generation
        do {
            let snapshot = try await provider.logOut()
            guard started == generation else { return }
            state.isPro = snapshot.isProActive
        } catch {
            // Anonymous already (logOutAnonymousUserError) or offline: Pro stays off.
        }
        // A login that was in flight may have re-identified RevenueCat after the logout.
        if started == generation, !provider.currentAppUserID().hasPrefix(Self.anonymousPrefix) {
            _ = try? await provider.logOut()
        }
    }
}
