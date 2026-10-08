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
    @State private var networkMonitor = NetworkMonitor()
    private let contentStore: ContentStore?
    private let syncQueueStore: SyncQueueStore
    private let podcastDownloadManager: PodcastDownloadManager
    /// The app's one SessionLifecycle. Created here so every store's cleanup is registered
    /// before any view, and so before any sign-out can happen.
    private let sessionLifecycle: SessionLifecycle

    init() {
        // ContentStore reads JSON bundled at build time (see that type's
        // doc comment) -- a failure here means the bundled resources are
        // missing, a build configuration problem, not a runtime one. Still
        // surfaced as a view rather than a crash, since a bad build should
        // fail visibly in TestFlight, not silently terminate on launch.
        contentStore = try? ContentStore()
        // Skip configure entirely when no key resolved (see
        // AppConfig.revenueCatAPIKey's doc comment) -- no provider is built in
        // that case, so nothing touches `Purchases.shared`, which fatalErrors
        // if accessed pre-configure. RevenueCatPurchases and EntitlementStore
        // are inert until start() or a call, so building them below is safe.
        if let revenueCatAPIKey = AppConfig.revenueCatAPIKey {
            Purchases.configure(withAPIKey: revenueCatAPIKey)
        }

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
        let container = (try? ModelContainer(for: schema, configurations: [ModelConfiguration(schema: schema)]))
            ?? (try! ModelContainer(for: schema, configurations: [ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)]))
        let queue = SyncQueueStore(modelContext: ModelContext(container))
        syncQueueStore = queue
        // Same container, its own context: the download manager and the
        // sync queue touch different models and should not contend for
        // one context's pending changes.
        podcastDownloadManager = PodcastDownloadManager(modelContext: ModelContext(container))

        let lifecycle = SessionLifecycle()
        let entitlements = EntitlementStore(provider: AppConfig.revenueCatAPIKey == nil ? nil : RevenueCatPurchases())
        AccountDataCleanup.register(
            on: lifecycle,
            queue: queue,
            caches: AccountLocalCaches(),
            clearWidget: { WidgetProgressPublisher.clear() },
            entitlements: entitlements
        )
        sessionLifecycle = lifecycle
        let session = Session(lifecycle: lifecycle)
        let scheduler = NotificationScheduler()
        let pushRegistrar = RemotePushRegistrar()
        // After the handlers above, so the queue and caches are already gone when these run.
        AuthAccountCleanup.register(
            on: lifecycle,
            deviceToken: { pushRegistrar.deviceTokenHex },
            retiringAccessToken: { session.retiringAccessToken },
            unregisterDeviceToken: { token, accessToken in
                try await ProgressSyncClient(
                    supabaseURL: AppConfig.supabaseURL,
                    anonKey: AppConfig.supabasePublishableKey,
                    accessToken: accessToken
                ).unregisterDeviceToken(token)
            },
            clearLocalNotifications: { await scheduler.cancelAll() },
            appleCredentials: AppleCredentialStore(),
            appleGivenNames: AppleGivenNameStore()
        )
        _session = State(initialValue: session)
        _notificationScheduler = State(initialValue: scheduler)
        _remotePushRegistrar = State(initialValue: pushRegistrar)
        _entitlementStore = State(initialValue: entitlements)
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
                .task { await entitlementStore.start() }
                .environment(\.sessionLifecycle, sessionLifecycle)
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
