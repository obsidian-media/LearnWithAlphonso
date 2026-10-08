import Foundation

/// Mirrors RevenueCat's `SubscriptionPeriod.Unit`. The Kit has no RevenueCat dependency;
/// the app's `RevenueCatPurchases` maps the real unit into this.
public enum BillingPeriodUnit: Sendable, Equatable {
    case day, week, month, year
}

public struct BillingPeriod: Sendable, Equatable {
    public let unit: BillingPeriodUnit
    public let value: Int

    public init(unit: BillingPeriodUnit, value: Int) {
        self.unit = unit
        self.value = value
    }
}

/// The fields of a RevenueCat `StoreProduct` the paywall needs, read verbatim from StoreKit.
/// `eligibleFreeTrial` is set only when the product has an introductory FREE TRIAL and
/// StoreKit says this user is still eligible for it, so the paywall never promises a trial
/// the purchase won't give.
public struct PaywallProduct: Sendable, Equatable {
    public let id: String
    public let localizedTitle: String
    public let localizedPriceString: String
    public let period: BillingPeriod?
    public let eligibleFreeTrial: BillingPeriod?

    public init(id: String, localizedTitle: String, localizedPriceString: String,
                period: BillingPeriod?, eligibleFreeTrial: BillingPeriod?) {
        self.id = id
        self.localizedTitle = localizedTitle
        self.localizedPriceString = localizedPriceString
        self.period = period
        self.eligibleFreeTrial = eligibleFreeTrial
    }
}

public enum PaywallLoadState: Sendable, Equatable {
    case loading
    case loaded([PaywallProduct])
    case failed
}

/// A text role's size and weight. `PaywallView` turns this into a font in exactly one place,
/// so "the price is at least as prominent as the trial" is a tested property of this data.
/// `weight` uses AlphonsoFont.Weight's raw values (400, 500, 600, 700).
public struct PaywallTextStyle: Sendable, Equatable {
    public let pointSize: Double
    public let weight: Int

    public init(pointSize: Double, weight: Int) {
        self.pointSize = pointSize
        self.weight = weight
    }

    public static let price = PaywallTextStyle(pointSize: 22, weight: 700)
    public static let trial = PaywallTextStyle(pointSize: 22, weight: 600)
    public static let disclosure = PaywallTextStyle(pointSize: 12, weight: 400)
}

public enum PaywallCopy {
    public static let fallbackTitle = "Alphonso Pro"
    public static let mascotMessage = "Meet Hector, your AI tutor"
    public static let featureBlurb = "Hector, your personal AI tutor for voice conversation practice, with memory of your level and weak spots between sessions."
    public static let loadFailed = "Couldn't load subscription options. Check your connection and try again."
    public static let tryAgain = "Try again"
    public static let startFreeTrial = "Start free trial"
    public static let subscribe = "Subscribe"
    public static let restore = "Restore Purchases"
    public static let manage = "Manage Subscription"
    public static let termsOfUse = "Terms of Use"
    public static let privacyPolicy = "Privacy Policy"
    public static let appleEULA = "Apple Standard EULA"
    public static let loadingAccessibilityLabel = "Loading subscription options"
    public static let pending = "Waiting for approval. Pro unlocks as soon as the purchase is approved."
    public static let restoreEmpty = "No active subscription found for this Apple Account."
    public static let restoreFailed = "Couldn't restore purchases. Check your connection and try again."
    public static let purchaseFailed = "The purchase couldn't be completed. Please try again."
    public static let purchasedNotActive = "Your purchase went through, but Pro isn't active yet. Tap Restore Purchases to check again."
    public static let genericRenewal = "Alphonso Pro renews automatically until you cancel. Cancel in your Apple Account settings at least 24 hours before the current period ends."

    /// Wording that must never reach the paywall again.
    public static let forbiddenPhrases = ["finishes reviewing", "reviewing our subscription", "aren't available yet"]

    public static let allUserFacing = [
        fallbackTitle, mascotMessage, featureBlurb, loadFailed, tryAgain, startFreeTrial, subscribe, restore,
        manage, termsOfUse, privacyPolicy, appleEULA, loadingAccessibilityLabel, pending, restoreEmpty,
        restoreFailed, purchaseFailed, purchasedNotActive, genericRenewal,
    ]
}

public enum PaywallLinks {
    /// App Store Connect keeps Apple's Standard EULA. Same URL as the Terms page.
    public static let appleStandardEULA = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
}

/// Everything the paywall shows, derived from the load state alone. `PaywallView` renders
/// it and adds nothing of its own.
public struct PaywallPresentation: Sendable, Equatable {
    public enum State: Sendable, Equatable {
        case loading
        case loaded
        case failed(message: String)
    }

    public let state: State
    public let productID: String?
    public let titleText: String
    public let priceLine: String?
    public let trialLine: String?
    public let ctaTitle: String?
    public let renewalDisclosure: String
    public let retryTitle: String?
    public let priceStyle: PaywallTextStyle = .price
    public let trialStyle: PaywallTextStyle = .trial
    public let disclosureStyle: PaywallTextStyle = .disclosure

    public static func make(_ load: PaywallLoadState) -> PaywallPresentation {
        switch load {
        case .loading:
            return PaywallPresentation(
                state: .loading, productID: nil, titleText: PaywallCopy.fallbackTitle, priceLine: nil,
                trialLine: nil, ctaTitle: nil, renewalDisclosure: PaywallCopy.genericRenewal, retryTitle: nil
            )
        case .failed:
            return failed
        case .loaded(let products):
            guard let product = products.first,
                  let period = product.period, period.value >= 1 else { return failed }
            let price = product.localizedPriceString.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !price.isEmpty else { return failed }
            let trimmedTitle = product.localizedTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            let title = trimmedTitle.isEmpty ? PaywallCopy.fallbackTitle : trimmedTitle
            let recurring = compactPrice(price, period)
            let trialLine: String? = product.eligibleFreeTrial.flatMap {
                $0.value >= 1 ? "Free for \(duration($0)), then \(recurring)" : nil
            }
            let disclosure = trialLine == nil
                ? "\(title) renews automatically at \(recurring) until you cancel. Payment is charged to your Apple Account when you confirm the purchase. Cancel in your Apple Account settings at least 24 hours before the current period ends."
                : "After the free trial, \(title) renews automatically at \(recurring) until you cancel. Payment is charged to your Apple Account when the trial ends. Cancel in your Apple Account settings at least 24 hours before the trial or any period ends."
            return PaywallPresentation(
                state: .loaded, productID: product.id, titleText: title,
                priceLine: priceLine(price, period), trialLine: trialLine,
                ctaTitle: trialLine == nil ? PaywallCopy.subscribe : PaywallCopy.startFreeTrial,
                renewalDisclosure: disclosure, retryTitle: nil
            )
        }
    }

    private static let failed = PaywallPresentation(
        state: .failed(message: PaywallCopy.loadFailed), productID: nil, titleText: PaywallCopy.fallbackTitle,
        priceLine: nil, trialLine: nil, ctaTitle: nil, renewalDisclosure: PaywallCopy.genericRenewal,
        retryTitle: PaywallCopy.tryAgain
    )

    /// "$9.99 / month", "$24.99 every 3 months".
    static func priceLine(_ price: String, _ period: BillingPeriod) -> String {
        period.value == 1
            ? "\(price) / \(word(period.unit, plural: false))"
            : "\(price) every \(period.value) \(word(period.unit, plural: true))"
    }

    /// "$9.99/month", "$24.99 every 3 months".
    static func compactPrice(_ price: String, _ period: BillingPeriod) -> String {
        period.value == 1
            ? "\(price)/\(word(period.unit, plural: false))"
            : "\(price) every \(period.value) \(word(period.unit, plural: true))"
    }

    /// "1 week", "2 weeks", "14 days".
    static func duration(_ period: BillingPeriod) -> String {
        "\(period.value) \(word(period.unit, plural: period.value != 1))"
    }

    private static func word(_ unit: BillingPeriodUnit, plural: Bool) -> String {
        switch unit {
        case .day: return plural ? "days" : "day"
        case .week: return plural ? "weeks" : "week"
        case .month: return plural ? "months" : "month"
        case .year: return plural ? "years" : "year"
        }
    }
}
