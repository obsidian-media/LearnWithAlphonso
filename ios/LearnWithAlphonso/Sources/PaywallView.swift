import SwiftUI
import RevenueCat

/// Shown wherever a feature is gated behind Pro (currently just Hector).
/// Loads the current RevenueCat offering on appear -- with a Test Store
/// key and no offering configured yet, `packages` stays empty and this
/// shows a clear "not available yet" state rather than a broken purchase
/// button or a silent blank screen.
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
            Text("Unlock Hector, your personal AI tutor, for $9.99/month.")
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
                    Button {
                        Task { await entitlementStore.purchase(package) }
                    } label: {
                        Text("Subscribe -- \(package.storeProduct.localizedPriceString)")
                    }
                    .buttonStyle(.alphonsoEmber)
                }
            }

            Button("Restore Purchases") {
                Task { await entitlementStore.restorePurchases() }
            }
            .font(AlphonsoFont.sans(13))
            .tint(AlphonsoColor.moss)

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
}
