import SwiftUI
import SwiftData
import LearnWithAlphonsoKit
import RevenueCat

@main
struct LearnWithAlphonsoApp: App {
    // V4 candidate #2 (real push) -- bridges UIApplicationDelegate's
    // callback-based remote-notification registration into this
    // otherwise pure-SwiftUI app. See AppDelegate.swift's doc comment.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session = Session()
    @State private var entitlementStore = EntitlementStore()
    @State private var notificationScheduler = NotificationScheduler()
    @State private var remotePushRegistrar = RemotePushRegistrar()
    @State private var networkMonitor = NetworkMonitor()
    private let contentStore: ContentStore?
    private let syncQueueStore: SyncQueueStore

    init() {
        // ContentStore reads JSON bundled at build time (see that type's
        // doc comment) -- a failure here means the bundled resources are
        // missing, a build configuration problem, not a runtime one. Still
        // surfaced as a view rather than a crash, since a bad build should
        // fail visibly in TestFlight, not silently terminate on launch.
        contentStore = try? ContentStore()
        // Skip configure entirely when no key resolved (see
        // AppConfig.revenueCatAPIKey's doc comment) -- EntitlementStore
        // checks the same condition before ever touching `Purchases.shared`,
        // which fatalErrors if accessed pre-configure.
        if let revenueCatAPIKey = AppConfig.revenueCatAPIKey {
            Purchases.configure(withAPIKey: revenueCatAPIKey)
        }

        let schema = Schema([
            PendingLessonCompletionRecord.self,
            PendingReviewGradeRecord.self,
            CachedDueReviewRecord.self,
            AppSyncStateRecord.self,
        ])
        // Falls back to an in-memory-only store on failure (e.g. disk full,
        // a corrupt store from a prior crash) rather than crashing launch --
        // the offline queue just won't persist across relaunches in that
        // rare case, which is a much smaller problem than the app not
        // opening at all.
        let container = (try? ModelContainer(for: schema, configurations: [ModelConfiguration(schema: schema)]))
            ?? (try! ModelContainer(for: schema, configurations: [ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)]))
        syncQueueStore = SyncQueueStore(modelContext: ModelContext(container))
    }

    var body: some Scene {
        WindowGroup {
            if let contentStore {
                RootView(
                    session: session,
                    contentStore: contentStore,
                    entitlementStore: entitlementStore,
                    notificationScheduler: notificationScheduler,
                    remotePushRegistrar: remotePushRegistrar,
                    networkMonitor: networkMonitor,
                    syncQueueStore: syncQueueStore
                )
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
