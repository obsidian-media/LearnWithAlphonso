package com.obsidianmedia.learnwithalphonso.ui

import com.obsidianmedia.learnwithalphonso.CrashReporting
import com.obsidianmedia.learnwithalphonso.core.firstrun.CompleteProfileSkip
import com.obsidianmedia.learnwithalphonso.core.firstrun.FirstRun
import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerAnswers
import com.obsidianmedia.learnwithalphonso.firstrun.FirstRunDevice
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CompleteProfileScreen
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FirstRunFlowScreen
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FirstRunHarness
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FirstRunHelloScreen
import com.obsidianmedia.learnwithalphonso.ui.firstrun.Under13StopScreen
import com.obsidianmedia.learnwithalphonso.ui.firstrun.signOutBlockedDevice
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonLightScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.first
import androidx.compose.material3.TextButton
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.BuildConfig
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.logic.DisplayNameOnboarding
import com.obsidianmedia.learnwithalphonso.core.logic.OnboardingStep
import com.obsidianmedia.learnwithalphonso.core.net.AppUpdateGate
import com.obsidianmedia.learnwithalphonso.core.net.fetchNameStatus
import com.obsidianmedia.learnwithalphonso.ui.onboarding.NameOnboardingScreen
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import com.obsidianmedia.learnwithalphonso.core.auth.AuthState
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.ui.achievements.AchievementsScreen
import com.obsidianmedia.learnwithalphonso.ui.auth.AuthScreen
import com.obsidianmedia.learnwithalphonso.ui.friends.DuelsScreen
import com.obsidianmedia.learnwithalphonso.ui.hector.HectorTab
import com.obsidianmedia.learnwithalphonso.ui.practice.CampaignConversationScreen
import com.obsidianmedia.learnwithalphonso.ui.practice.PracticeScreen
import com.obsidianmedia.learnwithalphonso.ui.practice.ScenarioConversationScreen
import com.obsidianmedia.learnwithalphonso.ui.friends.FriendsScreen
import com.obsidianmedia.learnwithalphonso.ui.friends.InviteAcceptScreen
import com.obsidianmedia.learnwithalphonso.ui.league.LeaderboardScreen
import com.obsidianmedia.learnwithalphonso.ui.league.SeasonScreen
import com.obsidianmedia.learnwithalphonso.ui.league.TeamsScreen
import com.obsidianmedia.learnwithalphonso.ui.profile.ProfileHubScreen
import com.obsidianmedia.learnwithalphonso.ui.learn.LearnScreen
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonScreen
import com.obsidianmedia.learnwithalphonso.ui.listen.ListenFolderScreen
import com.obsidianmedia.learnwithalphonso.ui.listen.ListenScreen
import com.obsidianmedia.learnwithalphonso.ui.listen.ListenViewModel
import com.obsidianmedia.learnwithalphonso.ui.listen.PodcastMiniBar
import androidx.compose.foundation.layout.Column
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.ui.nav.Routes
import com.obsidianmedia.learnwithalphonso.ui.placement.PlacementScreen
import com.obsidianmedia.learnwithalphonso.ui.review.ReviewScreen
import com.obsidianmedia.learnwithalphonso.ui.settings.SettingsScreen
import com.obsidianmedia.learnwithalphonso.ui.tabs.PlaceholderTab
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    Tab(Routes.LEARN, "Learn", Icons.Filled.MenuBook),
    Tab(Routes.LISTEN, "Listen", Icons.Filled.Headphones),
    Tab(Routes.PRACTICE, "Practice", Icons.Filled.Mic),
    Tab(Routes.HECTOR, "Hector", Icons.Filled.AutoAwesome),
    Tab(Routes.PROFILE, "Profile", Icons.Filled.Person),
)

/** Port of RootView.swift: restore the session, then auth or the five-tab app. */
@Composable
fun RootScreen(container: AppContainer, pendingInviteCode: String? = null, onInviteConsumed: () -> Unit = {}, harness: String? = null) {
    val session = container.session
    // This device answered Under 13: nothing but the stop screen, and nothing sent (FirstRunDevice).
    var firstRunBlocked by remember { mutableStateOf(FirstRunDevice.isBlocked) }
    // Signed out, the first run comes first; "I already have an account" and email open the sign-in screen.
    var showSignIn by rememberSaveable { mutableStateOf(false) }
    val themeIdForFirstRun by container.themeManager.theme.collectAsState()
    val paletteIdForFirstRun by container.themeManager.palette.collectAsState()
    val blockThisDevice: () -> Unit = {
        // Reporting may already be running: close it now. Everything else checks FirstRunDevice.isBlocked.
        CrashReporting.stop()
        firstRunBlocked = true
    }
    val isRestoring by session.isRestoring.collectAsState()
    val state by session.state.collectAsState()
    val palette = AlphonsoColor.palette

    val signedInUserId = (state as? AuthState.SignedIn)?.session?.userId
    // The active course is the signed-in account's own (English while signed out or never chosen). It is loaded
    // while composing, before any screen reads it: `session.restore()` sets SignedIn without suspending, so an effect
    // would run after Learn had already built its view model from the default and written it back over the saved choice.
    remember(signedInUserId) { container.activeCourse.accountChanged(signedInUserId); signedInUserId }
    // Signing out drops everything onboarding held for the account.
    LaunchedEffect(signedInUserId) {
        if (state !is AuthState.SignedIn) {
            container.onboarding.reset()
            // The next account on this device must not hear, see or resume the previous account's episode.
            container.podcastPlayer.stopForAccountChange()
        }
    }
    // The account's AI consent follows whoever is signed in (a choice made on the web or iOS counts here).
    LaunchedEffect(signedInUserId) { container.aiConsent.refresh() }
    // Voice choices made on the web or iOS reach this device's cache, so a call starts with the right voice.
    LaunchedEffect(signedInUserId) { if (signedInUserId != null) runCatching { container.voicePrefs.hydrate() } }
    // The "Please update" gate: off unless the server sets a minimum, and the app opens normally on any failure.
    var updateRequired by remember { mutableStateOf<AppUpdateGate.Requirement?>(null) }
    LaunchedEffect(Unit) { updateRequired = container.checkAppUpdate() }

    val gate = updateRequired

    Box(Modifier.fillMaxSize().background(palette.surface)) {
        when {
            // Before everything else: a blocked device shows only the stop screen, signed in or not.
            firstRunBlocked -> LessonLightScope(themeIdForFirstRun, paletteIdForFirstRun) { Under13StopScreen() }
            // DEBUG only: one first-run screen with a made-up learner, for screenshots (FirstRunHarness).
            harness != null && BuildConfig.DEBUG -> LessonLightScope(themeIdForFirstRun, paletteIdForFirstRun) { FirstRunHarness(harness, container) }
            // Replaces the app rather than covering it, so TalkBack cannot reach anything underneath.
            gate != null -> UpdateRequiredScreen(gate)
            isRestoring -> Unit
            state !is AuthState.SignedIn && showSignIn -> Box(Modifier.fillMaxSize()) {
                AuthScreen(container)
                TextButton(onClick = { showSignIn = false; session.clearMessages() }, modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(4.dp)) {
                    Text("Back to the questions", color = palette.moss)
                }
            }
            state !is AuthState.SignedIn -> LessonLightScope(themeIdForFirstRun, paletteIdForFirstRun) {
                FirstRunFlowScreen(
                    mode = FirstRun.Mode.NEW, store = FirstRunDevice.store, container = container,
                    onExit = { showSignIn = true }, onBlocked = blockThisDevice, onUnder13Ok = {},
                    onEmail = { showSignIn = true }, onHaveAccount = { showSignIn = true },
                )
            }
            else -> SignedInApp(container, pendingInviteCode, onInviteConsumed, blockThisDevice)
        }
    }
}

@Composable
private fun SignedInApp(container: AppContainer, pendingInviteCode: String?, onInviteConsumed: () -> Unit, onBlocked: () -> Unit) {
    val nav = rememberNavController()
    // The first run's cover: the answers from this device saved right after sign-in, or Complete your profile.
    var firstRunCover by remember { mutableStateOf<FirstRunCover?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(pendingInviteCode) {
        if (pendingInviteCode != null) {
            nav.navigate(Routes.invite(pendingInviteCode))
            onInviteConsumed()
        }
    }
    val palette = AlphonsoColor.palette
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    val showBar = currentRoute in Routes.tabs
    val userId = container.session.userId
    val flow = container.onboarding
    val namePresentation by flow.name.collectAsState()

    // The step after the name prompt: English placement, driven by OnboardingSequence so the order lives in one place.
    val advanceOnboarding: () -> Unit = {
        val id = userId
        if (id != null && flow.next(id) == OnboardingStep.PLACEMENT) {
            flow.finish(id, OnboardingStep.PLACEMENT)
            nav.navigate(Routes.placement("en"))
        }
    }

    LaunchedEffect(userId) {
        val id = userId ?: return@LaunchedEffect
        // Once per account per process: a rotation neither redoes the launch work nor loses the prompt. If this run is
        // cancelled before it finishes, the next composition runs it again.
        if (!flow.tryBegin(id)) return@LaunchedEffect
        try {
            coroutineScope {
                // The first run's answers (or Complete your profile) come first; the name prompt and placement follow
                // when that cover closes.
                val cover = checkFirstRun(container, id)
                if (cover != null) {
                    firstRunCover = cover
                    snapshotFlow { firstRunCover }.first { it == null }
                }
                // The onboarding checks start first, in their own coroutine, so they never wait behind sync, sign-in
                // to billing, reminders or push registration. A failed check skips its step this launch, never blocks.
                launch {
                    val status = runCatching { container.progressClient.fetchNameStatus() }.getOrNull()
                    val placed = runCatching { container.progressClient.fetchPlacementTakenAt("en") }.getOrNull()
                    val placementTaken = when {
                        placed != null -> true
                        runCatching { container.progressClient.fetchCefrLevel("en") }.isSuccess -> false
                        else -> null
                    }
                    flow.record(id, nameConfirmed = status?.nameConfirmed, placementTaken = placementTaken)
                    if (flow.next(id) == OnboardingStep.DISPLAY_NAME) {
                        val names = container.session.fetchUserNames()
                        flow.presentName(id, status?.let { DisplayNameOnboarding.start(DisplayNameOnboarding.prefill(names, it.displayName), it.displayName) })
                    }
                    advanceOnboarding()
                }
                launch {
                    container.syncCoordinator.triggerSync()
                    runCatching { container.progressClient.fetchProfileTheme(id) }.getOrNull()?.let(container.themeManager::hydrateFromServer)
                    container.entitlements.login(container.subscriptionLoginId(id))
                    container.reminders.onLaunch(container.syncStore.lastKnownProgress()?.lastActiveDate)
                    container.pushRegistrar.registerIfAuthorized()
                }
            }
        } catch (e: CancellationException) {
            flow.abandon(id)
            throw e
        }
    }

    Scaffold(
        containerColor = palette.surface,
        bottomBar = {
            Column {
            // Docked above the tab bar on every screen, as View.podcastMiniBar does per tab on iOS.
            PodcastMiniBar(container)
            if (showBar) {
                NavigationBar(containerColor = palette.parchment) {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(tab.label) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = palette.onPrimary,
                                selectedTextColor = palette.moss,
                                indicatorColor = palette.moss,
                                unselectedIconColor = palette.inkSoft,
                                unselectedTextColor = palette.inkSoft,
                            ),
                        )
                    }
                }
            }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = Routes.LEARN, modifier = Modifier.padding(padding)) {
            composable(Routes.LEARN) {
                LearnScreen(
                    container,
                    onOpenLesson = { course, id -> nav.navigate(Routes.lesson(course.code, id)) },
                    onOpenReview = { course -> nav.navigate(Routes.review(course.code)) },
                    onOpenPlacement = { course -> nav.navigate(Routes.placement(course.code)) },
                    onOpenSettings = { nav.navigate(Routes.SETTINGS) },
                )
            }
            composable(Routes.LISTEN) { entry ->
                val owner = remember(entry) { nav.getBackStackEntry(Routes.LISTEN) }
                val listenVm: ListenViewModel = viewModel(owner) { ListenViewModel(container.podcastClient, { container.downloads.entries() }, { container.connectivity.isConnected.value }, { container.activeCourse.course.value.code }, { container.downloads.removeAll(it) }, { container.podcastPlayer.state.value.episode?.id }) }
                ListenScreen(container, listenVm, onOpenFolder = { nav.navigate(Routes.listenFolder(it)) })
            }
            composable(Routes.LISTEN_FOLDER) { entry ->
                val owner = remember(entry) { nav.getBackStackEntry(Routes.LISTEN) }
                val listenVm: ListenViewModel = viewModel(owner) { ListenViewModel(container.podcastClient, { container.downloads.entries() }, { container.connectivity.isConnected.value }, { container.activeCourse.course.value.code }, { container.downloads.removeAll(it) }, { container.podcastPlayer.state.value.episode?.id }) }
                ListenFolderScreen(container, listenVm, entry.arguments?.getString("id") ?: "", onBack = { nav.popBackStack() }, onOpenFolder = { nav.navigate(Routes.listenFolder(it)) })
            }
            composable(Routes.PRACTICE) { PracticeScreen(container, onOpenScenario = { nav.navigate(Routes.scenario(it)) }, onOpenCampaign = { nav.navigate(Routes.campaign(it)) }) }
            composable(Routes.SCENARIO) { entry -> ScenarioConversationScreen(container, entry.arguments?.getString("id") ?: "", onBack = { nav.popBackStack() }) }
            composable(Routes.CAMPAIGN) { entry -> CampaignConversationScreen(container, entry.arguments?.getString("id") ?: "", onBack = { nav.popBackStack() }) }
            composable(Routes.HECTOR) { HectorTab(container) }
            composable(Routes.PROFILE) {
                ProfileHubScreen(
                    container = container,
                    onEditAnswers = { firstRunCover = FirstRunCover.Complete(edit = true) },
                    onOpenLeague = { nav.navigate(Routes.LEAGUE) },
                    onOpenFriends = { nav.navigate(Routes.FRIENDS) },
                    onOpenAchievements = { nav.navigate(Routes.ACHIEVEMENTS) },
                    onOpenSettings = { nav.navigate(Routes.SETTINGS) },
                )
            }
            composable(Routes.LEAGUE) { LeaderboardScreen(container, onBack = { nav.popBackStack() }, onOpenTeams = { nav.navigate(Routes.TEAMS) }, onOpenSeason = { nav.navigate(Routes.SEASON) }) }
            composable(Routes.TEAMS) { TeamsScreen(container, onBack = { nav.popBackStack() }) }
            composable(Routes.SEASON) { SeasonScreen(container, onBack = { nav.popBackStack() }) }
            composable(Routes.FRIENDS) { FriendsScreen(container, onBack = { nav.popBackStack() }, onOpenDuels = { nav.navigate(Routes.DUELS) }, onEnterCode = { code -> nav.navigate(Routes.invite(code)) }) }
            composable(Routes.DUELS) { DuelsScreen(container, onBack = { nav.popBackStack() }) }
            composable(Routes.ACHIEVEMENTS) { AchievementsScreen(container, onBack = { nav.popBackStack() }) }
            composable(Routes.INVITE) { entry -> InviteAcceptScreen(container, entry.arguments?.getString("code") ?: "", onDone = { nav.popBackStack() }) }
            composable(Routes.LESSON) { entry ->
                val course = Course.fromCode(entry.arguments?.getString("course") ?: "en")
                val lessonId = entry.arguments?.getString("lessonId") ?: ""
                LessonScreen(
                    container, course, lessonId, onExit = { nav.popBackStack() },
                    onReviewInstead = { nav.popBackStack(); nav.navigate(Routes.review(course.code)) },
                )
            }
            composable(Routes.REVIEW) { entry ->
                ReviewScreen(container, Course.fromCode(entry.arguments?.getString("course") ?: "en"), onExit = { nav.popBackStack() })
            }
            composable(Routes.PLACEMENT) { entry ->
                PlacementScreen(container, Course.fromCode(entry.arguments?.getString("course") ?: "en"), onFinished = { nav.popBackStack() })
            }
            composable(Routes.SETTINGS) { SettingsScreen(container, onBack = { nav.popBackStack() }) }
        }
    }

    firstRunCover?.let { cover ->
        val courseCode = container.activeCourse.course.value.code
        val placementTaken: suspend (String) -> Boolean = { c -> runCatching { container.progressClient.fetchPlacementTakenAt(c) }.getOrNull() != null }
        val finish: (FirstRun.Destination?) -> Unit = { destination ->
            firstRunCover = null
            when (destination) {
                FirstRun.Destination.PLACEMENT -> nav.navigate(Routes.placement(container.activeCourse.course.value.code))
                FirstRun.Destination.HECTOR -> nav.navigate(Routes.HECTOR) { launchSingleTop = true }
                else -> Unit
            }
        }
        LessonLightScope(container.themeManager.theme.collectAsState().value, container.themeManager.palette.collectAsState().value) {
            Box(Modifier.fillMaxSize()) {
                when (cover) {
                    is FirstRunCover.Hello -> FirstRunHelloScreen(
                        container, cover.answers, FirstRunDevice.store,
                        onFinish = { destination ->
                            cover.answers.course?.let { c -> Course.entries.firstOrNull { it.code == c } }?.let(container.activeCourse::set)
                            finish(destination)
                        },
                        placementTaken = { placementTaken(cover.answers.course ?: "en") },
                    )
                    is FirstRunCover.Complete -> CompleteProfileScreen(
                        container, courseCode, cover.edit, FirstRunDevice.store,
                        onFinish = finish,
                        onBlocked = onBlocked,
                        onUnder13Ok = { firstRunCover = null; signOutBlockedDevice(container) },
                        placementTaken = { placementTaken(courseCode) },
                    )
                }
            }
        }
        return
    }

    // The one-time public-name prompt covers the app until the learner saves or skips; placement follows.
    // Only a prompt that belongs to the signed-in account is ever shown.
    namePresentation?.takeIf { it.userId == userId }?.let { presentation ->
        NameOnboardingScreen(container, presentation) {
            userId?.let { flow.finish(it, OnboardingStep.DISPLAY_NAME) }
            advanceOnboarding()
        }
    }
}

private sealed interface FirstRunCover {
    data class Hello(val answers: LearnerAnswers) : FirstRunCover
    data class Complete(val edit: Boolean) : FirstRunCover
}

/** Picks the first-run cover for this account, if any: this device's answers first, then Complete your profile once. */
private suspend fun checkFirstRun(container: AppContainer, userId: String): FirstRunCover? {
    FirstRun.answersToSend(FirstRunDevice.store)?.let { return FirstRunCover.Hello(it) }
    if (CompleteProfileSkip.skippedThisLaunch) return null
    val profile = runCatching { container.learnerProfileClient.fetch() }.getOrNull() ?: return null
    if (container.session.userId != userId || !profile.needsCompleteProfile) return null
    return FirstRunCover.Complete(edit = false)
}
