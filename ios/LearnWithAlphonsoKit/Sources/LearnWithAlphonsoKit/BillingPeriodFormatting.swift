import Foundation

/// Mirrors RevenueCat's `SubscriptionPeriod.Unit` (day/week/month/year) --
/// duplicated here rather than imported, because this package has no
/// RevenueCat dependency (see Package.swift's own "zero UIKit/SwiftUI
/// dependency" doc comment: this stays a plain, cross-platform-testable
/// package). PaywallView (app target) maps the real
/// `package.storeProduct.subscriptionPeriod` into this before calling
/// `billingPeriodDescription`.
public enum BillingPeriodUnit: Sendable {
    case day, week, month, year
}

/// The one place the paywall's "billed how often" copy is derived, so it
/// can never say something StoreKit's own subscriptionPeriod disagrees
/// with -- see PaywallView's fix for why a second, independently-worded
/// copy of this was the bug in the first place.
public func billingPeriodDescription(unit: BillingPeriodUnit, value: Int) -> String {
    if value == 1 {
        switch unit {
        case .day: return "Billed daily"
        case .week: return "Billed weekly"
        case .month: return "Billed monthly"
        case .year: return "Billed yearly"
        }
    }
    let unitWord: String
    switch unit {
    case .day: unitWord = "days"
    case .week: unitWord = "weeks"
    case .month: unitWord = "months"
    case .year: unitWord = "years"
    }
    return "Billed every \(value) \(unitWord)"
}
