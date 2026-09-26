import SwiftUI
import LearnWithAlphonsoKit

struct RootView: View {
    let session: Session
    let contentStore: ContentStore
    let entitlementStore: EntitlementStore
    let notificationScheduler: NotificationScheduler
    let remotePushRegistrar: RemotePushRegistrar
    let networkMonitor: NetworkMonitor
    let syncQueueStore: SyncQueueStore
    let podcastDownloadManager: PodcastDownloadManager

    @Environment(\.scenePhase) private var scenePhase

    /// The one podcast player, owned here rather than in any view that can
    /// come and go. Being a reference type above the view tree is what
    /// makes playback survive navigation for free on iOS -- the web app had
    /// to be restructured to get the same property.
    @State private var podcastPlayer = PodcastAudioPlayer()
    /// Presents PlacementView once, right after a fresh sign-in, when this
    /// account's English placement has genuinely never been taken -- see
    /// PlacementView.swift's own doc comment for why this is keyed on that
    /// durable signal rather than a one-time "just signed up" event. Not a
    /// hard gate: PlacementView's own exit button dismisses it the same as
    /// this, and LessonBrowserView's persistent banner is the fallback for
    /// anyone who skips it here.
    @State private var showPlacementGate = false

    var body: some View {
        // Group wraps every branch so .preferredColorScheme below covers
        // AuthView too, not just the signed-in TabView -- forces every
        // screen (system-styled chrome included: navigation titles,
        // segmented pickers, ContentUnavailableView) to resolve colors
        // against the *active theme's* light/dark-ness rather than the
        // device's own Dark Mode setting, which is what caused a real bug
        // on a real device: system chrome flipped to light-on-dark text
        // while this app's fixed-light palette stayed put, making titles
        // and empty states unreadable. See AlphonsoTheme.swift's
        // AlphonsoPalette.colorScheme doc comment.
        Group {
            if session.isRestoring {
                // Keeps this identical, briefly, to a cold launch that has
                // no persisted session at all -- see Session.restoreSession's
                // own doc comment. Avoids flashing AuthView and then
                // flipping straight to the signed-in app a moment later on
                // every single launch, which is the exact scenario this
                // whole persistence effort exists to fix.
                AlphonsoColor.surface.ignoresSafeArea()
            } else {
                switch session.state {
                case .signedOut, .awaitingCode:
                    AuthView(session: session)
                case .signedIn:
                    // Exactly five tabs, deliberately. iPhone renders five and
                    // collapses the rest into a system "More" list, so the
                    // seven declared here previously meant Achievements was
                    // already buried before Listen needed a slot. League,
                    // Friends and Achievements now live behind Profile; Review
                    // is reachable from a row at the top of Learn, which is
                    // also what the badge below points at.
                    //
                    // Every tab's SF Symbol is distinct -- League and
                    // Achievements both used "trophy.fill" before this change.
                    // The mini bar is applied to each tab's CONTENT, not to
                    // the TabView: an inset on the TabView is consumed inside
                    // the tab bar's own region and the bar overlaps it (device
                    // check #12). See View.podcastMiniBar.
                    TabView {
                        LessonBrowserView(contentStore: contentStore, session: session, notificationScheduler: notificationScheduler, networkMonitor: networkMonitor, syncQueueStore: syncQueueStore)
                            .podcastMiniBar(player: podcastPlayer, session: session)
                            .tabItem { Label("Learn", systemImage: "book.fill") }
                            .badge(ReviewBadge.text(dueCount: syncQueueStore.lastKnownDueReviews().count))
                        ListenView(
                            session: session,
                            networkMonitor: networkMonitor,
                            player: podcastPlayer,
                            downloads: podcastDownloadManager
                        )
                            .podcastMiniBar(player: podcastPlayer, session: session)
                            .tabItem { Label("Listen", systemImage: "headphones") }
                        ConversationView(contentStore: contentStore, session: session)
                            .podcastMiniBar(player: podcastPlayer, session: session)
                            .tabItem { Label("Practice", systemImage: "mic.fill") }
                        HectorView(session: session, entitlementStore: entitlementStore)
                            .podcastMiniBar(player: podcastPlayer, session: session)
                            .tabItem { Label("Hector", systemImage: "sparkles") }
                        ProfileHubView(session: session, contentStore: contentStore, notificationScheduler: notificationScheduler)
                            .podcastMiniBar(player: podcastPlayer, session: session)
                            .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
                    }
                    // Meadow theme (see DesignSystem/AlphonsoTheme.swift): moss tint
                    // for selected tab items, parchment tab-bar background instead
                    // of the system default, matching the web app's brand.
                    .tint(AlphonsoColor.moss)
                    .toolbarBackground(AlphonsoColor.parchment, for: .tabBar)
                    .toolbarBackground(.visible, for: .tabBar)
                    .fullScreenCover(isPresented: $showPlacementGate) {
                        PlacementView(contentStore: contentStore, session: session, course: .english) {
                            showPlacementGate = false
                        }
                    }
                    .task {
                        // The player builds a client per call rather than
                        // holding one, because PodcastClient cannot refresh the
                        // token it was given.
                        podcastPlayer.makeClient = { makePodcastClient(session: session) }
                        await triggerSync()
                        await hydrateThemeFromServer()
                        notificationScheduler.scheduleWeeklyRecap()
                        await registerRemotePushIfNeeded()
                        await checkPlacementGate()
                        // Hector re-parenting Phase 1's own prerequisite:
                        // aliases RevenueCat's subscriber identity to this
                        // account so a server endpoint can verify "is this
                        // user Pro" later -- see EntitlementStore.login's
                        // own doc comment.
                        if let userID = session.userID {
                            await entitlementStore.login(userID: userID)
                        }
                    }
                    .onChange(of: networkMonitor.isConnected) { wasConnected, isConnected in
                        if !wasConnected && isConnected {
                            Task { await triggerSync() }
                        }
                    }
                    .onChange(of: scenePhase) { _, newPhase in
                        if newPhase == .active {
                            Task { await triggerSync() }
                        } else if newPhase == .background {
                            // Flush the listening position before the system can
                            // suspend or kill the process. Audio itself keeps
                            // going -- that is what UIBackgroundModes=audio buys.
                            podcastPlayer.applicationDidBackground()
                        }
                    }
                    .onChange(of: remotePushRegistrar.deviceTokenHex) { _, newToken in
                        guard let newToken else { return }
                        Task { await uploadDeviceToken(newToken) }
                    }
                }
            }
        }
        .task { await session.restoreSession() }
        .preferredColorScheme(AlphonsoThemeManager.shared.palette.colorScheme)
    }

    /// Drains the offline sync queue (docs/v2-kickoffs/01-offline-first.md)
    /// on connectivity regain and app foreground -- both, since a
    /// connectivity transition can be missed entirely while backgrounded.
    /// Safe to call opportunistically: an empty queue is a no-op, and
    /// SyncEngine.sync leaves any failed item queued for the next trigger.
    private func triggerSync() async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        let result = await SyncEngine.sync(
            pendingLessonCompletions: syncQueueStore.pendingLessonCompletions(),
            pendingReviewGrades: syncQueueStore.pendingReviewGrades(),
            client: client
        )
        syncQueueStore.removeSyncedLessonCompletions(result.syncedLessonCompletions)
        syncQueueStore.removeSyncedReviewGrades(result.syncedReviewGrades)
        if let lastKnownProgress = result.lastKnownProgress {
            syncQueueStore.updateLastKnownProgress(lastKnownProgress)
        } else if let fetched = try? await client.fetchProgress() {
            // SyncEngine.sync only learns progress as a side effect of
            // *pushing* a queued lesson completion, so with an empty queue
            // -- the normal state after a user has synced and then updated
            // or reinstalled -- it returns nil and the cache stays empty.
            // StatusHeaderView renders nothing when the cache is nil, which
            // is why a real tester reported their streak/hearts/XP/league
            // had disappeared entirely after updating. Read it directly in
            // that case so the header reflects the server, not just
            // whatever this device happens to have written locally.
            //
            // Best-effort by design (`try?`), same posture as
            // hydrateThemeFromServer below: a failed fetch leaves the
            // previous cached value alone rather than blanking the header.
            syncQueueStore.updateLastKnownProgress(fetched)
        } else {
            syncQueueStore.markSyncedNow()
        }
    }

    /// Whether English placement has genuinely never been taken for this
    /// account -- see PlacementView.swift's doc comment for why this
    /// checks `fetchPlacementTakenAt` rather than `fetchCefrLevel`
    /// returning nil (a `language_progress` row from ordinary lesson
    /// activity, `cefr_level` defaulted to 'A1', is not the same as
    /// placement having run). Best-effort by design: a failed check just
    /// means no prompt this launch, same posture as hydrateThemeFromServer
    /// below -- LessonBrowserView's persistent banner is the fallback
    /// that still catches this on its own next successful check.
    private func checkPlacementGate() async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            if try await client.fetchPlacementTakenAt(course: "en") == nil {
                showPlacementGate = true
            }
        } catch {
            // See doc comment above -- deliberately silent.
        }
    }

    /// Resolves the server's saved theme (mirrors the web's `theme.ts`
    /// `hydrateFromServer`: server value wins over whatever's already
    /// resolved locally). Best-effort -- a failed fetch just means this
    /// launch keeps using the local/default theme, same posture as every
    /// other best-effort call in this file.
    private func hydrateThemeFromServer() async {
        guard let accessToken = session.accessToken, let userID = session.userID else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        let serverTheme = try? await client.fetchProfileTheme(userID: userID)
        AlphonsoThemeManager.shared.hydrate(fromServerValue: serverTheme)
    }

    /// V4 candidate #2 -- re-registers for remote notifications on every
    /// launch/foreground (only actually calls
    /// UIApplication.registerForRemoteNotifications() if permission was
    /// already granted -- see RemotePushRegistrar.registerIfAuthorized's
    /// doc comment). Fires the deviceTokenHex onChange handler above once
    /// the AppDelegate callback lands.
    private func registerRemotePushIfNeeded() async {
        await remotePushRegistrar.registerIfAuthorized()
    }

    /// Uploads the APNs device token once both it and a signed-in session
    /// are available. Best-effort -- a failed upload here just means this
    /// device doesn't receive push until the next successful attempt
    /// (next launch/foreground re-triggers registerIfAuthorized, which
    /// re-delivers the same token via the same onChange path), never
    /// worth surfacing to the user for a feature this silent everywhere
    /// else (see the design doc: nothing about this feature is
    /// user-visible until Apple's own push banner appears).
    private func uploadDeviceToken(_ token: String) async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        try? await client.registerDeviceToken(token)
    }
}
