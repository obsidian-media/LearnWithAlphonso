import Foundation
@testable import LearnWithAlphonsoKit

struct MockPurchasesError: Error, Equatable {}

/// Holds a mock call open until the test opens it, so a test can interleave a sign-out
/// with an in-flight RevenueCat call.
@MainActor
final class Gate {
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private(set) var isOpen = false

    func wait() async {
        guard !isOpen else { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        isOpen = true
        waiters.forEach { $0.resume() }
        waiters.removeAll()
    }
}

@MainActor
final class MockPurchases: PurchasesProviding {
    var appUserID = "$RCAnonymousID:test"
    var customerInfoResult: Result<EntitlementSnapshot, Error> = .success(.init(isProActive: false))
    var logInResult: Result<EntitlementSnapshot, Error> = .success(.init(isProActive: false))
    var logOutResult: Result<EntitlementSnapshot, Error> = .success(.init(isProActive: false))
    var productsResult: Result<[PaywallProduct], Error> = .success([])
    var purchaseResult: Result<PurchaseOutcome, Error> = .success(.cancelled)
    var restoreResult: Result<EntitlementSnapshot, Error> = .success(.init(isProActive: false))
    var logInGate: Gate?
    var logOutGate: Gate?
    /// Simulates a login that resolved while a logout was in flight: the logout leaves this identity.
    var racedIdentity: String?
    private(set) var calls: [String] = []

    let updates: AsyncStream<EntitlementSnapshot>
    private let continuation: AsyncStream<EntitlementSnapshot>.Continuation

    init() {
        let pair = AsyncStream.makeStream(of: EntitlementSnapshot.self)
        updates = pair.stream
        continuation = pair.continuation
    }

    /// What RevenueCat's customerInfoStream delivers on Ask to Buy approval, a background
    /// renewal, an expiry or a purchase made on another device.
    func emit(_ snapshot: EntitlementSnapshot) { continuation.yield(snapshot) }

    func currentAppUserID() -> String { appUserID }

    func customerInfo() async throws -> EntitlementSnapshot {
        calls.append("customerInfo")
        return try customerInfoResult.get()
    }

    func logIn(_ userID: String) async throws -> EntitlementSnapshot {
        calls.append("logIn:\(userID)")
        if let logInGate { await logInGate.wait() }
        let result = try logInResult.get()
        appUserID = userID
        return result
    }

    func logOut() async throws -> EntitlementSnapshot {
        calls.append("logOut")
        if let logOutGate { await logOutGate.wait() }
        let result = try logOutResult.get()
        appUserID = racedIdentity ?? "$RCAnonymousID:test"
        racedIdentity = nil
        return result
    }

    func currentOfferingProducts() async throws -> [PaywallProduct] {
        calls.append("offerings")
        return try productsResult.get()
    }

    func purchase(productID: String) async throws -> PurchaseOutcome {
        calls.append("purchase:\(productID)")
        return try purchaseResult.get()
    }

    func restorePurchases() async throws -> EntitlementSnapshot {
        calls.append("restore")
        return try restoreResult.get()
    }

    func customerInfoUpdates() -> AsyncStream<EntitlementSnapshot> { updates }
}
