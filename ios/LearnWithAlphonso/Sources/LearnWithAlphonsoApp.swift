import SwiftUI
import LearnWithAlphonsoKit
import RevenueCat

@main
struct LearnWithAlphonsoApp: App {
    @State private var session = Session()
    @State private var entitlementStore = EntitlementStore()
    private let contentStore: ContentStore?

    init() {
        // ContentStore reads JSON bundled at build time (see that type's
        // doc comment) -- a failure here means the bundled resources are
        // missing, a build configuration problem, not a runtime one. Still
        // surfaced as a view rather than a crash, since a bad build should
        // fail visibly in TestFlight, not silently terminate on launch.
        contentStore = try? ContentStore()
        Purchases.configure(withAPIKey: AppConfig.revenueCatAPIKey)
    }

    var body: some Scene {
        WindowGroup {
            if let contentStore {
                RootView(session: session, contentStore: contentStore, entitlementStore: entitlementStore)
                    .task { await entitlementStore.refresh() }
            } else {
                ContentUnavailableView(
                    "Couldn't load lesson content",
                    systemImage: "exclamationmark.triangle",
                    description: Text("Please reinstall the app.")
                )
            }
        }
    }
}
