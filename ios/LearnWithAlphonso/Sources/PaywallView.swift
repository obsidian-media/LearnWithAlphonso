import SwiftUI
import RevenueCat
import LearnWithAlphonsoKit

/// Shown wherever a feature is gated behind Pro (currently just Hector).
/// Loads the current RevenueCat offering on appear -- with a Test Store
/// key and no offering configured yet, `packages` stays empty and this
/// shows a clear "not available yet" state rather than a broken purchase
/// button or a silent blank screen.
///
/// StoreKit (via `package.storeProduct`) is the only source of price and
/// billing-period truth here -- there used to also be a hardcoded
/// "$9.99/month" line above the button, which meant every non-US
/// storefront showed a price in the blurb that disagreed with the price
/// on the button it sat next to. Nothing on this screen states a price
/// or period without reading it from the product.
struct PaywallView: View {
    let entitlementStore: EntitlementStore

    var body: some View {
        VStack(spacing: AlphonsoSpacing.lg) {
            Text("Alphonso Pro")
                .font(AlphonsoFont.display(28, weight: .bold))
                .foregroundStyle(AlphonsoColor.ink)

            // This is the exact screen the account owner pointed at
            // during brainstorming as "everything wrong with how it
            // looks" -- an SF Symbol and plain text, despite Hector's
            // real bundled portrait existing. This banner is that fix.
            AlphonsoMascotBanner(mascot: .hector, message: "Meet Hector, your AI tutor")

            // What's included -- describes the feature itself, not price
            // or billing, so it carries no per-storefront accuracy risk.
            Text("Hector, your personal AI tutor for voice conversation practice, with memory of your level and weak spots between sessions.")
                .font(AlphonsoFont.sans(14))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)

            if entitlementStore.isLoading {
                ProgressView().tint(AlphonsoColor.ember)
            } else if entitlementStore.packages.isEmpty {
                Text("Subscriptions aren't available yet -- check back soon.")
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .multilineTextAlignment(.center)
            } else {
                ForEach(entitlementStore.packages, id: \.identifier) { package in
                    VStack(spacing: 2) {
                        Button {
                            Task { await entitlementStore.purchase(package) }
                        } label: {
                            Text("Subscribe -- \(package.storeProduct.localizedPriceString)")
                        }
                        .buttonStyle(.alphonsoEmber)

                        // Billing period, read from the same product as the
                        // price above it -- never a second, independently
                        // worded copy of what StoreKit already states.
                        if let billingPeriod = billingPeriodText(for: package) {
                            Text(billingPeriod)
                                .font(AlphonsoFont.sans(12))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                        }
                    }
                }
            }

            Button("Restore Purchases") {
                Task { await entitlementStore.restorePurchases() }
            }
            .font(AlphonsoFont.sans(13))
            .tint(AlphonsoColor.moss)

            // Renews-automatically + how-to-cancel: standard subscription
            // disclosure text, not derived from any product field, so it's
            // shown regardless of loading/empty/error state above.
            Text("Subscriptions renew automatically unless canceled at least 24 hours before the end of the current period. Cancel anytime in Settings > Subscriptions on your device.")
                .font(AlphonsoFont.sans(11))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)

            if let errorMessage = entitlementStore.errorMessage {
                Text(errorMessage)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
        .frame(maxWidth: 360)
        .background(AlphonsoColor.surface)
        .task { await entitlementStore.loadOffering() }
    }

    /// Maps RevenueCat's `SubscriptionPeriod` onto Kit's
    /// `billingPeriodDescription` -- nil for a non-subscription product
    /// (no period to state), never a guessed default.
    private func billingPeriodText(for package: Package) -> String? {
        guard let period = package.storeProduct.subscriptionPeriod else { return nil }
        let unit: BillingPeriodUnit
        switch period.unit {
        case .day: unit = .day
        case .week: unit = .week
        case .month: unit = .month
        case .year: unit = .year
        @unknown default: return nil
        }
        return billingPeriodDescription(unit: unit, value: period.value)
    }
}
