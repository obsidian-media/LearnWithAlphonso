import Foundation
import RevenueCat
import LearnWithAlphonsoKit

/// The only file that turns RevenueCat into Kit types (`PurchasesProviding`). Nothing here
/// touches `Purchases.shared` until a method is called. `LearnWithAlphonsoApp.init`
/// configures Purchases before any call can happen, but the @State initializers that build
/// this object run BEFORE that init body, so the initializer must stay inert.
@MainActor
final class RevenueCatPurchases: PurchasesProviding {
    private enum AdapterError: Error { case productNotLoaded }

    /// Packages from the last offering load, so a purchase by product id uses the exact
    /// package the paywall showed.
    private var packagesByProductID: [String: Package] = [:]

    func currentAppUserID() -> String { Purchases.shared.appUserID }

    func customerInfo() async throws -> EntitlementSnapshot {
        Self.snapshot(try await Purchases.shared.customerInfo())
    }

    func logIn(_ userID: String) async throws -> EntitlementSnapshot {
        Self.snapshot(try await Purchases.shared.logIn(userID).customerInfo)
    }

    /// RevenueCat throws logOutAnonymousUserError for an anonymous user. There is nothing
    /// to log out then, so this reports the anonymous user's state instead.
    func logOut() async throws -> EntitlementSnapshot {
        packagesByProductID = [:]
        if Purchases.shared.isAnonymous {
            return Self.snapshot(try await Purchases.shared.customerInfo())
        }
        return Self.snapshot(try await Purchases.shared.logOut())
    }

    func currentOfferingProducts() async throws -> [PaywallProduct] {
        let offerings = try await Purchases.shared.offerings()
        let packages = offerings.current?.availablePackages ?? []
        var byID: [String: Package] = [:]
        var products: [PaywallProduct] = []
        for package in packages {
            let storeProduct = package.storeProduct
            byID[storeProduct.productIdentifier] = package
            products.append(PaywallProduct(
                id: storeProduct.productIdentifier,
                localizedTitle: storeProduct.localizedTitle,
                localizedPriceString: storeProduct.localizedPriceString,
                period: storeProduct.subscriptionPeriod.flatMap(Self.period),
                eligibleFreeTrial: await Self.eligibleFreeTrial(for: storeProduct)
            ))
        }
        packagesByProductID = byID
        return products
    }

    /// RevenueCat 5.x's async purchase THROWS purchaseCancelledError on a cancel (its
    /// continuation resumes with the error even though userCancelled is true), and
    /// paymentPendingError for Ask to Buy / SCA. Both are outcomes, not failures.
    func purchase(productID: String) async throws -> PurchaseOutcome {
        guard let package = packagesByProductID[productID] else { throw AdapterError.productNotLoaded }
        do {
            let result = try await Purchases.shared.purchase(package: package)
            if result.userCancelled { return .cancelled }
            return .completed(Self.snapshot(result.customerInfo))
        } catch {
            switch Self.errorCode(error) {
            case .purchaseCancelledError?: return .cancelled
            case .paymentPendingError?: return .pending
            default: throw error
            }
        }
    }

    func restorePurchases() async throws -> EntitlementSnapshot {
        Self.snapshot(try await Purchases.shared.restorePurchases())
    }

    func customerInfoUpdates() -> AsyncStream<EntitlementSnapshot> {
        let source = Purchases.shared.customerInfoStream
        return AsyncStream { continuation in
            let task = Task {
                for await info in source {
                    continuation.yield(Self.snapshot(info))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: - Mapping

    private nonisolated static func snapshot(_ info: CustomerInfo) -> EntitlementSnapshot {
        EntitlementSnapshot(isProActive: info.entitlements[AppConfig.proEntitlementID]?.isActive == true)
    }

    private nonisolated static func eligibleFreeTrial(for product: StoreProduct) async -> BillingPeriod? {
        guard let intro = product.introductoryDiscount, intro.paymentMode == .freeTrial,
              let trial = period(intro.subscriptionPeriod) else { return nil }
        let status = await Purchases.shared.checkTrialOrIntroDiscountEligibility(product: product)
        return status == .eligible ? trial : nil
    }

    private nonisolated static func period(_ period: SubscriptionPeriod) -> BillingPeriod? {
        let unit: BillingPeriodUnit
        switch period.unit {
        case .day: unit = .day
        case .week: unit = .week
        case .month: unit = .month
        case .year: unit = .year
        @unknown default: return nil
        }
        return BillingPeriod(unit: unit, value: period.value)
    }

    private nonisolated static func errorCode(_ error: Error) -> RevenueCat.ErrorCode? {
        if let code = error as? RevenueCat.ErrorCode { return code }
        let nsError = error as NSError
        guard nsError.domain == RevenueCat.ErrorCode.errorDomain else { return nil }
        return RevenueCat.ErrorCode(rawValue: nsError.code)
    }
}
