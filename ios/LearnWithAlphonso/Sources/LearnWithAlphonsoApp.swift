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
    @State private var session: Session
    @State private var entitlementStore: EntitlementStore
    @State private var notificationScheduler: NotificationScheduler
    @State private var remotePushRegistrar: RemotePushRegistrar
    @State private var networkMonitor: NetworkMonitor
    private let contentStore: ContentStore?
    private let syncQueueStore: SyncQueueStore
    private let podcastDownloadManager: PodcastDownloadManager

    init() {
        // TEMPORARY (2026-09-28): see LaunchBreadcrumbs.swift's doc comment.
        // Every checkpoint below is bracketed start/end so the LAST line in
        // the log file is the one that never finished. The five @State
        // properties above lost their inline `= Type()` defaults and moved
        // here on purpose -- a struct's stored-property defaults run BEFORE
        // its own custom init() body's first statement, which would have
        // put all five ahead of even `startNewRun()` and made them
        // invisible to this entire log.
        LaunchBreadcrumbs.startNewRun()

        LaunchBreadcrumbs.log("Session() start")
        session = Session()
        LaunchBreadcrumbs.log("Session() done")
        LaunchBreadcrumbs.log("EntitlementStore() start")
        entitlementStore = EntitlementStore()
        LaunchBreadcrumbs.log("EntitlementStore() done")
        LaunchBreadcrumbs.log("NotificationScheduler() start")
        notificationScheduler = NotificationScheduler()
        LaunchBreadcrumbs.log("NotificationScheduler() done")
        LaunchBreadcrumbs.log("RemotePushRegistrar() start")
        remotePushRegistrar = RemotePushRegistrar()
        LaunchBreadcrumbs.log("RemotePushRegistrar() done")
        LaunchBreadcrumbs.log("NetworkMonitor() start")
        networkMonitor = NetworkMonitor()
        LaunchBreadcrumbs.log("NetworkMonitor() done")

        // ContentStore reads JSON bundled at build time (see that type's
        // doc comment) -- a failure here means the bundled resources are
        // missing, a build configuration problem, not a runtime one. Still
        // surfaced as a view rather than a crash, since a bad build should
        // fail visibly in TestFlight, not silently terminate on launch.
        LaunchBreadcrumbs.log("ContentStore() start")
        contentStore = try? ContentStore()
        LaunchBreadcrumbs.log("ContentStore() done, nil=\(contentStore == nil)")
        // Skip configure entirely when no key resolved (see
        // AppConfig.revenueCatAPIKey's doc comment) -- EntitlementStore
        // checks the same condition before ever touching `Purchases.shared`,
        // which fatalErrors if accessed pre-configure.
        LaunchBreadcrumbs.log("Purchases.configure start")
        if let revenueCatAPIKey = AppConfig.revenueCatAPIKey {
            Purchases.configure(withAPIKey: revenueCatAPIKey)
        }
        LaunchBreadcrumbs.log("Purchases.configure done")

        let schema = Schema([
            PendingLessonCompletionRecord.self,
            PendingReviewGradeRecord.self,
            CachedDueReviewRecord.self,
            AppSyncStateRecord.self,
            // Offline podcast downloads share this container rather than
            // opening a second store -- one more thing to migrate, for no
            // benefit.
            PodcastDownloadRecord.self,
        ])
        // Falls back to an in-memory-only store on failure (e.g. disk full,
        // a corrupt store from a prior crash) rather than crashing launch --
        // the offline queue just won't persist across relaunches in that
        // rare case, which is a much smaller problem than the app not
        // opening at all.
        LaunchBreadcrumbs.log("ModelContainer start")
        let container = (try? ModelContainer(for: schema, configurations: [ModelConfiguration(schema: schema)]))
            ?? (try! ModelContainer(for: schema, configurations: [ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)]))
        LaunchBreadcrumbs.log("ModelContainer done")
        syncQueueStore = SyncQueueStore(modelContext: ModelContext(container))
        // Same container, its own context: the download manager and the
        // sync queue touch different models and should not contend for
        // one context's pending changes.
        podcastDownloadManager = PodcastDownloadManager(modelContext: ModelContext(container))
        LaunchBreadcrumbs.log("App.init() returning")
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
                    syncQueueStore: syncQueueStore,
                    podcastDownloadManager: podcastDownloadManager
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
