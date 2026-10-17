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
    /// StoreKit's price in the product's own currency, used only to compare plans of one offering
    /// ("Save 33%"). Never shown: the localized string is what the learner reads.
    public let price: Decimal
    public let period: BillingPeriod?
    public let eligibleFreeTrial: BillingPeriod?

    public init(id: String, localizedTitle: String, localizedPriceString: String, price: Decimal,
                period: BillingPeriod?, eligibleFreeTrial: BillingPeriod?) {
        self.id = id
        self.localizedTitle = localizedTitle
        self.localizedPriceString = localizedPriceString
        self.price = price
        self.period = period
        self.eligibleFreeTrial = eligibleFreeTrial
    }
}

/// Why the paywall opened, recorded on the RevenueCat customer when a purchase STARTS (so a cancelled attempt
/// also stamps it, last write wins): it reads "entry point of the last purchase attempt", which for a subscriber
/// is the one that sold. Raw values are the attribute values; never rename one.
public enum PaywallSource: String, Sendable, Equatable, CaseIterable {
    /// The Hector tab, for a learner without Pro.
    case hectorTab = "hector_tab"
    /// The server refused Hector mid-conversation (lapsed, refunded, other device).
    case hectorRefused = "hector_not_entitled"
    /// The "Practise speaking with Hector" card on the Practice tab.
    case practiceCard = "practice_hector_card"

    /// The RevenueCat custom attribute key the source is written under.
    public static let attributeKey = "paywall_source"
}

/// One plan the learner can pick when the offering has more than one.
public struct PaywallPlanOption: Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let priceLine: String
    /// "Save 33%" on the yearly plan when it costs less than twelve months of the monthly one.
    public let savingsLine: String?
    /// "2-week free trial" when this plan has a free trial the learner is eligible for, so a trial on a plan
    /// that is not selected is never hidden.
    public let trialNote: String?
    public let isSelected: Bool
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

    /// The point size of every primary button label (AlphonsoPrimaryButtonStyle reads this),
    /// so the paywall's price can be tested against the real call-to-action size.
    public static let primaryButtonPointSize: Double = 17
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
    /// The Practice tab's invitation to Hector, shown only to learners without Pro.
    public static let practiceCardTitle = "Practise speaking with Hector"
    public static let practiceCardSubtitle = "A voice tutor that remembers your level and weak spots. Part of Alphonso Pro."

    /// Wording that must never reach the paywall again.
    public static let forbiddenPhrases = ["finishes reviewing", "reviewing our subscription", "aren't available yet"]

    public static let allUserFacing = [
        fallbackTitle, mascotMessage, featureBlurb, loadFailed, tryAgain, startFreeTrial, subscribe, restore,
        manage, termsOfUse, privacyPolicy, appleEULA, loadingAccessibilityLabel, pending, restoreEmpty,
        restoreFailed, purchaseFailed, purchasedNotActive, genericRenewal, practiceCardTitle, practiceCardSubtitle,
    ]
}

public enum PaywallLinks {
    /// Apple's Standard EULA, the license that applies to this app's subscription.
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
    /// Every plan, yearly first, when there is more than one; empty when there is one (no picker).
    public var options: [PaywallPlanOption] = []
    public let titleText: String
    public let priceLine: String?
    public let trialLine: String?
    public let ctaTitle: String?
    public let renewalDisclosure: String
    public let retryTitle: String?
    public let priceStyle: PaywallTextStyle = .price
    public let trialStyle: PaywallTextStyle = .trial
    public let disclosureStyle: PaywallTextStyle = .disclosure

    /// `selectedProductID` is the learner's pick; when it is nil or not offered, a yearly plan is
    /// chosen if there is one, otherwise the first product, which keeps a one-plan offering exactly
    /// as it was.
    public static func make(_ load: PaywallLoadState, selectedProductID: String? = nil) -> PaywallPresentation {
        switch load {
        case .loading:
            return PaywallPresentation(
                state: .loading, productID: nil, titleText: PaywallCopy.fallbackTitle, priceLine: nil,
                trialLine: nil, ctaTitle: nil, renewalDisclosure: PaywallCopy.genericRenewal, retryTitle: nil
            )
        case .failed:
            return failed
        case .loaded(let products):
            let usable = products.filter {
                ($0.period?.value ?? 0) >= 1
                    && !$0.localizedPriceString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
            let ordered = usable.filter { $0.period.map(isYearly) == true } + usable.filter { $0.period.map(isYearly) != true }
            let chosen = usable.first { $0.id == selectedProductID }
                ?? ordered.first { $0.period.map(isYearly) == true }
                ?? products.first
            guard let product = chosen,
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
            var presentation = PaywallPresentation(
                state: .loaded, productID: product.id, titleText: title,
                priceLine: priceLine(price, period), trialLine: trialLine,
                ctaTitle: trialLine == nil ? PaywallCopy.subscribe : PaywallCopy.startFreeTrial,
                renewalDisclosure: disclosure, retryTitle: nil
            )
            if ordered.count > 1 {
                let saving = yearlySaving(ordered)
                presentation.options = ordered.map { option in
                    let optionPeriod = option.period!
                    let optionPrice = option.localizedPriceString.trimmingCharacters(in: .whitespacesAndNewlines)
                    return PaywallPlanOption(
                        id: option.id,
                        title: planTitle(optionPeriod),
                        priceLine: priceLine(optionPrice, optionPeriod),
                        savingsLine: isYearly(optionPeriod) ? saving.map { "Save \($0)%" } : nil,
                        trialNote: option.eligibleFreeTrial.flatMap { $0.value >= 1 ? "\(trialLength($0)) free trial" : nil },
                        isSelected: option.id == product.id
                    )
                }
            }
            return presentation
        }
    }

    private static let failed = PaywallPresentation(
        state: .failed(message: PaywallCopy.loadFailed), productID: nil, titleText: PaywallCopy.fallbackTitle,
        priceLine: nil, trialLine: nil, ctaTitle: nil, renewalDisclosure: PaywallCopy.genericRenewal,
        retryTitle: PaywallCopy.tryAgain
    )

    static func isYearly(_ period: BillingPeriod) -> Bool {
        (period.unit == .year && period.value == 1) || (period.unit == .month && period.value == 12)
    }

    /// "Yearly", "Monthly", "Every 3 months".
    static func planTitle(_ period: BillingPeriod) -> String {
        if isYearly(period) { return "Yearly" }
        if period.value == 1 {
            switch period.unit {
            case .day: return "Daily"
            case .week: return "Weekly"
            case .month: return "Monthly"
            case .year: return "Yearly"
            }
        }
        return "Every \(period.value) \(word(period.unit, plural: true))"
    }

    /// Whole percent saved by the yearly plan against twelve months of the monthly one, rounded
    /// down, or nil when either is missing, the currencies could differ, or the saving is under 5%.
    static func yearlySaving(_ products: [PaywallProduct]) -> Int? {
        guard let yearly = products.first(where: { $0.period.map(isYearly) == true }),
              let monthly = products.first(where: { $0.period == BillingPeriod(unit: .month, value: 1) }),
              monthly.price > 0, yearly.price > 0 else { return nil }
        let twelve = monthly.price * 12
        guard yearly.price < twelve else { return nil }
        var fraction = (twelve - yearly.price) / twelve * 100
        var rounded = Decimal()
        NSDecimalRound(&rounded, &fraction, 0, .down)
        let percent = NSDecimalNumber(decimal: rounded).intValue
        return percent >= 5 ? percent : nil
    }

    /// "2-week", "7-day", "1-month".
    static func trialLength(_ period: BillingPeriod) -> String {
        "\(period.value)-\(word(period.unit, plural: false))"
    }

    /// "$9.99 / month", "$24.99 every 3 months"; a 12-month plan reads "/ year".
    static func priceLine(_ price: String, _ period: BillingPeriod) -> String {
        if isYearly(period) { return "\(price) / year" }
        return period.value == 1
            ? "\(price) / \(word(period.unit, plural: false))"
            : "\(price) every \(period.value) \(word(period.unit, plural: true))"
    }

    /// "$9.99/month", "$24.99 every 3 months"; a 12-month plan reads "/year".
    static func compactPrice(_ price: String, _ period: BillingPeriod) -> String {
        if isYearly(period) { return "\(price)/year" }
        return period.value == 1
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
