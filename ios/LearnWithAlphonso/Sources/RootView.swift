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
    /// The cover is driven by this item and reads nothing else, so the name prompt's state travels inside it
    /// (a separate @State read only inside the cover's content closure was captured stale and rendered empty).
    @State private var onboarding: OnboardingPresentation?
    @State private var onboardingDone: Set<OnboardingStep> = []
    /// The first run ended on Meet Hector: the placement onboarding cover must not open over Hector.
    @State private var hectorChosenInFirstRun = false
    @State private var nameConfirmed: Bool?
    /// The first name pinned on the Pro paywall's card; nil for a generated handle.
    @State private var paywallName: String?
    @State private var placementTaken: Bool?
    /// True once checkOnboarding has finished for the current account (the Learn tab's placement banner waits for it).
    @State private var onboardingChecked = false
    @State private var nameOnboarding: DisplayNameOnboarding?
    /// Set when the server says this build is below the lowest one it still supports (AppUpdateGate). Nil (the app
    /// opens normally) unless the owner sets a minimum, and on any failure to ask.
    @State private var updateRequired: AppUpdateGate.Requirement?
    /// The first run (visual round 6, part 3). Signed out: the questions come first, and the sign-in screen opens
    /// from their sign-in step, "I already have an account" or Back on the first question.
    @State private var showSignIn = false
    /// This device answered Under 13: nothing but the stop screen, and nothing sent (FirstRunDevice).
    @State private var firstRunBlocked = FirstRunDevice.isBlocked
    /// Signed in: saving the device's answers, or Complete your profile, then the placement test a first-run
    /// answer asked for. Shown before the name prompt, which waits its turn (the web's holdNamePrompt).
    @State private var firstRunCover: FirstRunCover?
    @State private var firstRunNext: FirstRun.Destination?
    @State private var firstRunName: String?
    @State private var selectedTab = RootTab.learn
    /// Path stops that live in another tab (podcast, talk, campaign scene) travel through this.
    @State private var pathDeepLink = PathDeepLink()

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
            if let screen = Self.harnessScreen {
                harnessView(screen)
            } else if session.isRestoring {
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
                    signedOutView
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
                    TabView(selection: $selectedTab) {
                        LessonBrowserView(contentStore: contentStore, session: session, notificationScheduler: notificationScheduler, networkMonitor: networkMonitor, syncQueueStore: syncQueueStore, onboardingSettled: onboardingChecked && onboarding == nil, podcastPlayer: podcastPlayer, podcastDownloadManager: podcastDownloadManager, activeCourse: activeCourse, hectorAccess: HectorAccess(entitlementStore: entitlementStore, activeCourse: activeCourse, conversationStore: conversationStore))
                            .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
                            .tabItem { Label("Learn", systemImage: "book.fill") }
                            .tag(RootTab.learn)
                            .badge(ReviewBadge.text(dueCount: syncQueueStore.dueReviewCount))
                        ListenView(
                            session: session,
                            networkMonitor: networkMonitor,
                            player: podcastPlayer,
                            downloads: podcastDownloadManager,
                            activeCourse: activeCourse
                        )
                            .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
                            .tabItem { Label("Library", systemImage: "headphones") }
                            .tag(RootTab.listen)
                        ConversationView(contentStore: contentStore, session: session, activeCourse: activeCourse, conversationStore: conversationStore, entitlementStore: entitlementStore)
                            .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
                            .tabItem { Label("Practice", systemImage: "mic.fill") }
                            .tag(RootTab.practice)
                        HectorView(session: session, entitlementStore: entitlementStore, activeCourse: activeCourse, conversationStore: conversationStore)
                            .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
                            .tabItem { Label("Hector", systemImage: "sparkles") }
                            .tag(RootTab.hector)
                        ProfileHubView(session: session, contentStore: contentStore, notificationScheduler: notificationScheduler,
                                       entitlementStore: entitlementStore, activeCourse: activeCourse, networkMonitor: networkMonitor, syncQueueStore: syncQueueStore,
                                       onEditAnswers: { firstRunCover = .complete(edit: true) })
                            .podcastMiniBar(player: podcastPlayer, session: session, downloads: podcastDownloadManager, networkMonitor: networkMonitor)
                            .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
                            .tag(RootTab.profile)
                    }
                    .environment(pathDeepLink)
                    .onChange(of: pathDeepLink.pending) { _, destination in
                        if let destination, let tab = PathDeepLink.tab(for: destination) { selectedTab = tab }
                        // A podcast stop has nothing more to do once the Listen tab is showing.
                        if destination == .podcastLibrary { pathDeepLink.pending = nil }
                    }
                    // Meadow theme (see DesignSystem/AlphonsoTheme.swift): moss tint
                    // for selected tab items, parchment tab-bar background instead
                    // of the system default, matching the web app's brand.
                    .tint(AlphonsoColor.moss)
                    .toolbarBackground(AlphonsoColor.parchment, for: .tabBar)
                    .toolbarBackground(.visible, for: .tabBar)
                    .fullScreenCover(item: $firstRunCover, onDismiss: firstRunDismissed) { cover in
                        firstRunCoverView(cover)
                    }
                    .fullScreenCover(item: $onboarding, onDismiss: advanceOnboarding) { presentation in
                        switch presentation {
                        case .displayName(let nameOnboarding):
                            NameOnboardingView(session: session, state: nameOnboarding) {
                                finishOnboardingStep(.displayName)
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
                            // RevenueCat gets the account's separate subscription identifier (never shown anywhere);
                            // any failure falls back to the account id, which the server also accepts.
                            let subscriptionID = await SubscriptionLogin.resolve(
                                baseURL: AppConfig.apiBaseURL, accountID: userID,
                                accessToken: await session.freshAccessToken())
                            await entitlementStore.login(userID: subscriptionID)
                        }
                        await triggerSync()
                        await hydrateThemeFromServer()
                        await session.hydrateVoicePrefs()
                        notificationScheduler.scheduleWeeklyRecap()
                        await registerRemotePushIfNeeded()
                        // The same device token after a sign-out and sign-in never fires onChange, so the new
                        // account would never get a device_tokens row. Upload whatever is already known.
                        if let token = remotePushRegistrar.deviceTokenHex {
                            await uploadDeviceToken(token)
                        }
                        await session.checkAppleCredential()
                        // The first run's answers (or Complete your profile) come first; the name prompt and placement
                        // follow when that cover closes (firstRunDismissed).
                        if await checkFirstRun() { return }
                        let onboardingUser = session.userID
                        await checkOnboarding()
                        if session.userID == onboardingUser { onboardingChecked = true }
                    }
                    .task(id: syncQueueStore.queueRevision) {
                        // Wakes the queue when its next retry is due. SwiftUI cancels this sleep and starts a new one
                        // whenever something is queued or a sync pass ends. Foreground and reconnect handlers remain
                        // the safety net after iOS suspension.
                        guard let userID = session.userID,
                              let due = syncQueueStore.nextPendingAttempt(for: userID) else { return }
                        // The floor is what stops a loop: an item that is due but cannot be sent yet (the session
                        // could not be refreshed, say) would otherwise start a new pass the moment the last one ended.
                        let delay = max(Self.minimumSyncWakeupSeconds, due.timeIntervalSinceNow)
                        do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                        guard !Task.isCancelled, session.userID == userID, networkMonitor.isConnected else { return }
                        // Not awaited here: the pass ends by changing queueRevision, which cancels this task.
                        Task { await triggerSync() }
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
        .overlay {
            if let updateRequired { UpdateRequiredView(requirement: updateRequired) }
        }
        .task {
            // An under-13 device asks nothing of the server, not even the update check.
            guard !FirstRunDevice.isBlocked else { return }
            updateRequired = await AppUpdateGate.check(
                baseURL: AppConfig.apiBaseURL,
                currentBuild: AppUpdateGate.build(
                    fromBundleVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String))
        }
        .task {
            // An under-13 device restores no session (that would refresh it with the auth server): it stays signed
            // out on the stop screen, and any stored session is dropped locally.
            if FirstRunDevice.isBlocked {
                session.dropStoredSessionLocally()
                return
            }
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
            // A cover left up by the previous account must not carry its name prompt into the next one.
            // If onDismiss then fires, advance with nil inputs returns nil.
            onboarding = nil
            onboardingDone = []
            nameConfirmed = nil
            placementTaken = nil
            nameOnboarding = nil
            onboardingChecked = false
            firstRunCover = nil
            firstRunNext = nil
            firstRunName = nil
            showSignIn = false
            selectedTab = .learn
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
        // The round-6 design system colours for the chosen palette (DesignSystem/AlphonsoDSEnvironment.swift).
        .alphonsoDesignSystem()
        .environment(\.paywallLearner, PaywallLearner(course: activeCourse.course, name: paywallName))
        #if DEBUG
        .sheet(isPresented: $uiTestPaywall) {
            PaywallView(entitlementStore: entitlementStore, source: .hectorTab)
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

    /// DEBUG only: one first-run screen with a made-up learner, for screenshots (FirstRunHarness). Nil in Release.
    private static var harnessScreen: String? {
        #if DEBUG
        return FirstRunHarness.screen
        #else
        return nil
        #endif
    }

    @ViewBuilder private func harnessView(_ screen: String) -> some View {
        #if DEBUG
        FirstRunHarnessView(screen: screen, session: session, entitlementStore: entitlementStore, contentStore: contentStore)
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

    // MARK: - First run

    /// Signed out: the stop screen on an under-13 device; the sign-in screen when asked for (or while a code is
    /// awaited); otherwise the first run.
    @ViewBuilder private var signedOutView: some View {
        if firstRunBlocked {
            Under13StopView()
        } else if showSignIn || session.state != .signedOut {
            AuthView(session: session)
                .overlay(alignment: .topLeading) {
                    if session.state == .signedOut {
                        Button {
                            showSignIn = false
                        } label: {
                            Image(systemName: "chevron.left").fontWeight(.semibold)
                                .frame(width: 44, height: 44)
                        }
                        .tint(AlphonsoColor.moss)
                        .accessibilityLabel("Back to the questions")
                        .padding(.leading, AlphonsoSpacing.sm)
                    }
                }
        } else {
            FirstRunFlowView(
                mode: .new, store: FirstRunDevice.store, contentStore: contentStore,
                onExit: { showSignIn = true },
                onBlocked: blockThisDevice,
                onUnder13Ok: {},
                session: session,
                onEmail: { showSignIn = true },
                onHaveAccount: { showSignIn = true })
        }
    }

    /// Under 13 was chosen: from here on nothing is sent from this device. Crash reporting stops now (it may already
    /// be running), and the rest checks FirstRunDevice.isBlocked before it would send.
    private func blockThisDevice() {
        CrashReporting.stop()
        Analytics.setConsent(false)
        firstRunBlocked = true
    }

    /// Picks the first-run cover for this account, if any. True when one is showing.
    private func checkFirstRun() async -> Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-UITestSkipOnboarding") { return false }
        #endif
        let checkedUser = session.userID
        if let answers = FirstRun.answersToSend(FirstRunDevice.store) {
            firstRunName = answers.name
            firstRunCover = .hello(answers)
            return true
        }
        guard !CompleteProfileSkip.skippedThisLaunch,
              let profile = try? await learnerProfileClient(session)?.fetch(),
              session.userID == checkedUser, profile.needsCompleteProfile else { return false }
        firstRunCover = .complete(edit: false)
        return true
    }

    @ViewBuilder private func firstRunCoverView(_ cover: FirstRunCover) -> some View {
        switch cover {
        case .hello(let answers):
            FirstRunHelloView(
                session: session, entitlementStore: entitlementStore, answers: answers, store: FirstRunDevice.store,
                onFinish: { destination in
                    if let course = answers.course.flatMap(Course.init(wireCode:)) { activeCourse.course = course }
                    finishFirstRun(destination)
                },
                placementTaken: { await placementTaken(for: answers.course ?? "en") })
        case .complete(let edit):
            CompleteProfileView(
                session: session, entitlementStore: entitlementStore, contentStore: contentStore,
                course: activeCourse.course, edit: edit, store: FirstRunDevice.store,
                onFinish: { finishFirstRun($0) },
                onBlocked: blockThisDevice,
                onUnder13Ok: {
                    firstRunCover = nil
                    session.signOutBlockedDevice()
                },
                placementTaken: { await placementTaken(for: activeCourse.course.wireCode) })
        case .placement(let course):
            PlacementView(contentStore: contentStore, session: session, course: course) {
                firstRunCover = nil
            }
        }
    }

    private func finishFirstRun(_ destination: FirstRun.Destination?) {
        firstRunNext = destination
        firstRunCover = nil
    }

    /// The cover closed: the placement test the answers asked for, Hector, or straight on; then the name prompt.
    private func firstRunDismissed() {
        if FirstRunDevice.isBlocked { return }
        let next = firstRunNext
        firstRunNext = nil
        switch next {
        case .placement?:
            firstRunCover = .placement(activeCourse.course)
            return
        case .hector?:
            hectorChosenInFirstRun = true
            selectedTab = .hector
        default:
            break
        }
        guard session.userID != nil, !onboardingChecked else { return }
        Task {
            let onboardingUser = session.userID
            await checkOnboarding()
            if session.userID == onboardingUser { onboardingChecked = true }
        }
    }

    private func placementTaken(for course: String) async -> Bool {
        guard let token = await session.freshAccessToken() else { return true }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
        return ((try? await client.fetchPlacementTakenAt(course: course)) ?? nil) != nil
    }

    /// Drains the offline sync queue (docs/v2-kickoffs/01-offline-first.md)
    /// on connectivity regain and app foreground -- both, since a
    /// connectivity transition can be missed entirely while backgrounded.
    /// Safe to call opportunistically: an empty queue is a no-op, and
    /// SyncEngine.sync leaves any failed item queued for the next trigger.
    /// The shortest wait between a sync pass ending and the retry wakeup starting another.
    private static let minimumSyncWakeupSeconds: TimeInterval = 30

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
        onboardingChecked = false
        onboarding = nil
        onboardingDone = []
        nameConfirmed = nil
        paywallName = nil
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
                        appleGivenName: session.appleGivenNameForCurrentUser ?? firstRunName,
                        names: names,
                        currentName: status.displayName
                    )
                    nameOnboarding = DisplayNameOnboarding(prefill: prefill, currentName: status.displayName)
                }
                nameConfirmed = !status.needsPrompt
                paywallName = status.nameConfirmed ? ProPaywallContent.cardFirstName(status.displayName) : nil
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
        #if DEBUG
        // UI tests only: the seeded demo account has not confirmed its name, and skipping the prompt would write to it.
        if ProcessInfo.processInfo.arguments.contains("-UITestSkipOnboarding") { onboarding = nil; return }
        #endif
        // A step without what its screen needs is skipped inside advance (marked done), never shown empty.
        let result = OnboardingSequence.advance(
            nameConfirmed: nameConfirmed, placementTaken: placementTaken,
            done: OnboardingSequence.done(onboardingDone, hectorChosen: hectorChosenInFirstRun), nameOnboarding: nameOnboarding)
        onboardingDone = result.done
        onboarding = result.presentation
    }

    private func finishOnboardingStep(_ step: OnboardingStep) {
        onboardingDone.insert(step)
        // Dismissing runs onDismiss (advanceOnboarding), which presents the next step, if any.
        onboarding = nil
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

enum RootTab: Hashable { case learn, listen, practice, hector, profile }

/// What the first-run cover shows for a signed-in learner.
enum FirstRunCover: Identifiable {
    case hello(LearnerAnswers)
    case complete(edit: Bool)
    case placement(Course)

    var id: String {
        switch self {
        case .hello: return "hello"
        case .complete(let edit): return edit ? "edit" : "complete"
        case .placement: return "placement"
        }
    }
}
