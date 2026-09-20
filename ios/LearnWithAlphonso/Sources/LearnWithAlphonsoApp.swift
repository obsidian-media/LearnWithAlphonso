import SwiftUI
import SwiftData
import LearnWithAlphonsoKit
import RevenueCat

@main
struct LearnWithAlphonsoApp: App {
    @State private var session = Session()
    @State private var entitlementStore = EntitlementStore()
    @State private var notificationScheduler = NotificationScheduler()
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
        Purchases.configure(withAPIKey: AppConfig.revenueCatAPIKey)

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
