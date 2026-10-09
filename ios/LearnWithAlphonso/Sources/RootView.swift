import SwiftUI
import UIKit
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
    /// The active course, shared by Learn, Practice and Hector.
    @State private var activeCourse = ActiveCourseModel()
    /// Every open conversation keyed by (scenario, course), held above the tabs so a conversation survives tab
    /// switches. Cleared when the signed-in account changes.
    @State private var conversationStore = ConversationStore()
    /// Follows the system light/dark setting live (see SystemAppearanceObserver).
    @State private var appearanceObserver = SystemAppearanceObserver()
    #if DEBUG
    /// UI tests only (-UITestShowPaywall): the demo account is Pro, and the paywall is otherwise reachable
    /// only from Hector for non-Pro users, so the compatibility runs open it directly.
    @State private var uiTestPaywall = ProcessInfo.processInfo.arguments.contains("-UITestShowPaywall")
    /// UI tests only (-UITestLayoutProbe): exposes whether the app is laid out portrait or landscape.
    private static let uiTestLayoutProbe = ProcessInfo.processInfo.arguments.contains("-UITestLayoutProbe")
    #endif
    /// Onboarding after a sign-in: the public-name prompt first (while name_confirmed_at is NULL), then
    /// English placement (while it has never been taken; see PlacementView's doc comment). Each step shows at
    /// most once per sign-in, and a failed check skips its step this launch instead of blocking the app
    /// (Kit OnboardingSequence). LessonBrowserView's banner still catches anyone who skips placement.
    @State private var onboardingStep: OnboardingStep?
    @State private var onboardingDone: Set<OnboardingStep> = []
    @State private var nameConfirmed: Bool?
    @State private var placementTaken: Bool?
    @State private var nameOnboarding: DisplayNameOnboarding?

    var body: some View {
        // Group wraps every branch so .preferredColorScheme below covers
        // AuthView too, not just the signed-in TabView -- forces every
        // screen (system-styled chrome included: navigation titles,
        // segmented pickers, ContentUnavailableView) to resolve colors
        // against the *active theme's* light/dark-ness, which is what
        // caused a real bug on a real device before dark variants existed:
        // system chrome flipped to light-on-dark text while this app's
        // then-fixed-light palette stayed put, making titles and empty
        // states unreadable.
        //
        // That's no longer a device-Dark-Mode-vs-app-mismatch bug (Dark
        // Interface support, BACKLOG item): AlphonsoThemeManager.palette
        // now resolves its OWN light/dark variant from `systemColorScheme`
        // below, so `.preferredColorScheme` here just keeps forcing native
        // chrome to agree with whichever variant that already picked --
        // same invariant as before, now automatically correct for Dark
        // Mode instead of fighting it. See AlphonsoTheme.swift's
        // AlphonsoThemeManager.palette doc comment for the actual switch.
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
                        LessonBrowserView(contentStore: contentStore, session: session, notificationScheduler: notificationScheduler, networkMonitor: networkMonitor, syncQueueStore: syncQueueStore, podcastPlayer: podcastPlayer, podcastDownloadManager: podcastDownloadManager, activeCourse: activeCourse)
                            .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
                            .tabItem { Label("Learn", systemImage: "book.fill") }
                            .badge(ReviewBadge.text(dueCount: syncQueueStore.dueReviewCount))
                        ListenView(
                            session: session,
                            networkMonitor: networkMonitor,
                            player: podcastPlayer,
                            downloads: podcastDownloadManager,
                            activeCourse: activeCourse
                        )
                            .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
                            .tabItem { Label("Listen", systemImage: "headphones") }
                        ConversationView(contentStore: contentStore, session: session, activeCourse: activeCourse, conversationStore: conversationStore)
                            .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
                            .tabItem { Label("Practice", systemImage: "mic.fill") }
                        HectorView(session: session, entitlementStore: entitlementStore, activeCourse: activeCourse, conversationStore: conversationStore)
                            .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
                            .tabItem { Label("Hector", systemImage: "sparkles") }
                        ProfileHubView(session: session, contentStore: contentStore, notificationScheduler: notificationScheduler)
                            .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
                            .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
                    }
                    // Meadow theme (see DesignSystem/AlphonsoTheme.swift): moss tint
                    // for selected tab items, parchment tab-bar background instead
                    // of the system default, matching the web app's brand.
                    .tint(AlphonsoColor.moss)
                    .toolbarBackground(AlphonsoColor.parchment, for: .tabBar)
                    .toolbarBackground(.visible, for: .tabBar)
                    .fullScreenCover(item: $onboardingStep, onDismiss: advanceOnboarding) { step in
                        switch step {
                        case .displayName:
                            if let nameOnboarding {
                                NameOnboardingView(session: session, state: nameOnboarding) {
                                    finishOnboardingStep(.displayName)
                                }
                            }
                        case .placement:
                            PlacementView(contentStore: contentStore, session: session, course: .english) {
                                finishOnboardingStep(.placement)
                            }
                        }
                    }
                    .task {
                        // The player builds a client per call rather than
                        // holding one, because PodcastClient cannot refresh the
                        // token it was given.
                        podcastPlayer.makeClient = { makePodcastClient(session: session) }
                        // The voice engine silences the podcast through this hook. It is registered here, with the
                        // player this view actually keeps, because RootView's state initializer can build throwaway
                        // players that would otherwise claim the hook and then disappear.
                        VoiceAudioHooks.pauseOtherAudio = { [weak podcastPlayer] in podcastPlayer?.pauseForVoice() }
                        // Sign-out and account deletion stop the podcast through this hook (the Kit's
                        // PodcastAccountCleanup handlers, registered in LearnWithAlphonsoApp). Same reason
                        // as above for registering it here.
                        PodcastLifecycleHooks.stopPlayback = { [weak podcastPlayer] in podcastPlayer?.stopForAccountChange() }
                        // Identity first: RevenueCat can still hold a previous account
                        // (an upgrade, an interrupted sign-out), and nothing here should
                        // run, or show Pro, before it is aliased to this account. See
                        // EntitlementStore.login's doc comment.
                        if let userID = session.userID {
                            await entitlementStore.login(userID: userID)
                        }
                        await triggerSync()
                        await hydrateThemeFromServer()
                        notificationScheduler.scheduleWeeklyRecap()
                        await registerRemotePushIfNeeded()
                        // The same device token after a sign-out and sign-in never fires onChange, so the new
                        // account would never get a device_tokens row. Upload whatever is already known.
                        if let token = remotePushRegistrar.deviceTokenHex {
                            await uploadDeviceToken(token)
                        }
                        await session.checkAppleCredential()
                        await checkOnboarding()
                    }
                    .onChange(of: networkMonitor.isConnected) { wasConnected, isConnected in
                        if !wasConnected && isConnected {
                            Task { await triggerSync() }
                        }
                    }
                    .onChange(of: scenePhase) { _, newPhase in
                        if newPhase == .active {
                            // Re-checking the real system appearance here
                            // too, not just on launch -- see
                            // updateRealSystemColorScheme's doc comment for
                            // why this replaced @Environment(\.colorScheme)
                            // entirely.
                            updateRealSystemColorScheme()
                            // Refresh first: the proactive refresh timer in
                            // Session doesn't run while suspended, so after a
                            // long background stint the stored token may have
                            // expired, and every call below would 401.
                            Task {
                                await session.refreshIfNeeded()
                                await session.checkAppleCredential()
                                await triggerSync()
                            }
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
        .task {
            await session.restoreSession()
            // No stored session: RevenueCat must not keep a previous account's identity.
            if session.userID == nil {
                await entitlementStore.reconcileSignedOut()
            }
        }
        // The next account on this device must not see the previous account's conversations, nor start in its course.
        // The store is replaced, not emptied: a turn still in flight for the previous account holds the old store,
        // so its late reply lands in a store nobody reads.
        .onChange(of: session.userID) {
            conversationStore = ConversationStore()
        }
        .onChange(of: session.userID, initial: true) {
            activeCourse.accountChanged(to: session.userID)
        }
        .onAppear {
            // See updateRealSystemColorScheme's doc comment. Runs once,
            // immediately, so the manager has a real system value before
            // the very first `.preferredColorScheme` below is ever read --
            // without it, a fresh launch would render one frame against
            // the `.light` fallback default even on a device already in
            // Dark Mode.
            appearanceObserver.start()
        }
        .preferredColorScheme(AlphonsoThemeManager.shared.palette.colorScheme)
        #if DEBUG
        .sheet(isPresented: $uiTestPaywall) {
            PaywallView(entitlementStore: entitlementStore)
        }
        .overlay(alignment: .topLeading) {
            if Self.uiTestLayoutProbe {
                GeometryReader { proxy in
                    Text(proxy.size.width > proxy.size.height ? "landscape" : "portrait")
                        .font(.system(size: 1))
                        .opacity(0.01)
                        .frame(width: 1, height: 1)
                        .accessibilityIdentifier("uiTest.layout")
                }
                .allowsHitTesting(false)
            }
        }
        #endif
    }

    /// Build 38's launch hang (2026-09-28, confirmed fixed in build 40):
    /// `@Environment(\.colorScheme)` read here, combined with
    /// `.preferredColorScheme` applied to this same view's content, formed
    /// a feedback loop -- `.preferredColorScheme` can write back into this
    /// window's own trait collection, which `@Environment(\.colorScheme)`
    /// then re-reports as a "new" system change on the very next render,
    /// forever (confirmed live via a temporary on-device log:
    /// `systemColorScheme` alternated dark/light on literally every
    /// render, from the first frame, thousands of times a second -- not
    /// the build-29 loop again, that guard is still intact and unrelated).
    /// `UIScreen.main.traitCollection` is never affected by this app's own
    /// `overrideUserInterfaceStyle`/`.preferredColorScheme` (those apply to
    /// windows/view controllers, never to `UIScreen` itself), so reading
    /// it imperatively at controlled points -- launch and returning to
    /// foreground -- detects the real system appearance with no reactive
    /// SwiftUI environment binding to feed back into. Live changes while
    /// the app stays in the foreground now arrive through
    /// SystemAppearanceObserver (UIScreen trait registration, gated by the
    /// Kit's AppearanceChangeGate, which stops after 4 flips in 2 s);
    /// this method re-arms the gate and re-reads on return to the foreground.
    private func updateRealSystemColorScheme() {
        appearanceObserver.applyCurrent(rearm: true)
    }

    /// Drains the offline sync queue (docs/v2-kickoffs/01-offline-first.md)
    /// on connectivity regain and app foreground -- both, since a
    /// connectivity transition can be missed entirely while backgrounded.
    /// Safe to call opportunistically: an empty queue is a no-op, and
    /// SyncEngine.sync leaves any failed item queued for the next trigger.
    private func triggerSync() async {
        // The drain, progress and per-course due refresh live in SyncQueueStore.runSync. The same-account guard
        // is preserved: nothing is written back if the signed-in account changed while this ran.
        guard let accessToken = await session.freshAccessToken(), let syncingUserID = session.userID else { return }
        await syncQueueStore.runSync(
            accessToken: accessToken,
            userID: syncingUserID,
            refreshAccessToken: { [session] in await session.freshAccessToken(forceRefresh: true) },
            isCurrentAccount: { session.userID == syncingUserID })
    }

    /// Reads what onboarding still needs for this account and shows the first step. Best-effort: a failed read
    /// leaves that input nil, which skips the step this launch (Kit OnboardingSequence). An empty name status
    /// (no profile row) also counts as "skip the prompt this launch". Placement is keyed on
    /// `fetchPlacementTakenAt` rather than `fetchCefrLevel` returning nil: a `language_progress` row from
    /// ordinary lesson activity (cefr_level defaulted to 'A1') is not the same as placement having run.
    private func checkOnboarding() async {
        onboardingDone = []
        nameConfirmed = nil
        placementTaken = nil
        nameOnboarding = nil
        guard let accessToken = session.accessToken else { return }
        // Every await below can outlive this account: bail if someone else signed in meanwhile.
        let checkedUser = session.userID
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            if let status = try await client.fetchNameStatus() {
                guard session.userID == checkedUser else { return }
                if status.needsPrompt {
                    let names = await session.fetchUserNames()
                    guard session.userID == checkedUser else { return }
                    let prefill = DisplayNameOnboarding.prefill(
                        appleGivenName: session.appleGivenNameForCurrentUser,
                        names: names,
                        currentName: status.displayName
                    )
                    nameOnboarding = DisplayNameOnboarding(prefill: prefill, currentName: status.displayName)
                }
                nameConfirmed = !status.needsPrompt
            }
        } catch {
            // Deliberately silent: no prompt this launch, never a blocked app.
        }
        guard session.userID == checkedUser else { return }
        do {
            let taken = try await client.fetchPlacementTakenAt(course: "en") != nil
            guard session.userID == checkedUser else { return }
            placementTaken = taken
        } catch {
            // LessonBrowserView's persistent banner is the fallback.
        }
        guard session.userID == checkedUser else { return }
        advanceOnboarding()
    }

    private func advanceOnboarding() {
        onboardingStep = OnboardingSequence.next(nameConfirmed: nameConfirmed, placementTaken: placementTaken, done: onboardingDone)
    }

    private func finishOnboardingStep(_ step: OnboardingStep) {
        onboardingDone.insert(step)
        // Dismissing runs onDismiss (advanceOnboarding), which presents the next step, if any.
        onboardingStep = nil
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
