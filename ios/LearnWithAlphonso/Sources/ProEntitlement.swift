import Foundation

/// Single source of truth for "does this user have the Pro subscription"
/// (currently: Hector/Cloud Voice access). Hardcoded false until RevenueCat
/// is wired up (needs a RevenueCat account, created separately -- see
/// AGENTS.md). Every Pro-gated view reads `ProEntitlement.isPro` rather
/// than checking anything itself, so swapping this one property for a real
/// RevenueCat `Purchases.shared.customerInfo` check is the only change
/// needed once that's ready -- no consuming view should need to change.
enum ProEntitlement {
    static var isPro: Bool { false }
}
