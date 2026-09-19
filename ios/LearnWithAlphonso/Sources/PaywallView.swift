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
        VStack(spacing: 20) {
            Image(systemName: "sparkles")
                .font(.system(size: 48))
                .foregroundStyle(.yellow)
            Text("Alphonso Pro")
                .font(.title.weight(.bold))
            Text("Unlock Hector, your personal AI tutor, for $9.99/month.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if entitlementStore.isLoading {
                ProgressView()
            } else if entitlementStore.packages.isEmpty {
                Text("Subscriptions aren't available yet -- check back soon.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            } else {
                ForEach(entitlementStore.packages, id: \.identifier) { package in
                    Button {
                        Task { await entitlementStore.purchase(package) }
                    } label: {
                        Text("Subscribe -- \(package.storeProduct.localizedPriceString)")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }

            Button("Restore Purchases") {
                Task { await entitlementStore.restorePurchases() }
            }
            .font(.footnote)

            if let errorMessage = entitlementStore.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
        .frame(maxWidth: 360)
        .task { await entitlementStore.loadOffering() }
    }
}
