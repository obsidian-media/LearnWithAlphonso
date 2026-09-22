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
            Image(systemName: "sparkles")
                .font(.system(size: 48))
                .foregroundStyle(AlphonsoColor.ember)
            Text("Alphonso Pro")
                .font(AlphonsoFont.display(28, weight: .bold))
                .foregroundStyle(AlphonsoColor.ink)
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
