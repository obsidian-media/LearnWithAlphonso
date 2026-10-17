package com.obsidianmedia.learnwithalphonso.ui

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
fun RootScreen(container: AppContainer, pendingInviteCode: String? = null, onInviteConsumed: () -> Unit = {}) {
    val session = container.session
    val isRestoring by session.isRestoring.collectAsState()
    val state by session.state.collectAsState()
    val palette = AlphonsoColor.palette

    LaunchedEffect(Unit) { session.restore() }
    // Signing out drops everything onboarding held for the account.
    LaunchedEffect((state as? AuthState.SignedIn)?.session?.userId) {
        if (state !is AuthState.SignedIn) {
            container.onboarding.reset()
            // The next account on this device must not hear, see or resume the previous account's episode.
            container.podcastPlayer.stopForAccountChange()
        }
    }
    // The account's AI consent follows whoever is signed in (a choice made on the web or iOS counts here).
    val signedInUserId = (state as? AuthState.SignedIn)?.session?.userId
    LaunchedEffect(signedInUserId) { container.aiConsent.refresh() }

    Box(Modifier.fillMaxSize().background(palette.surface)) {
        when {
            isRestoring -> Unit
            state !is AuthState.SignedIn -> AuthScreen(container)
            else -> SignedInApp(container, pendingInviteCode, onInviteConsumed)
        }
    }
}

@Composable
private fun SignedInApp(container: AppContainer, pendingInviteCode: String?, onInviteConsumed: () -> Unit) {
    val nav = rememberNavController()

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
                    container.entitlements.login(id)
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
                val listenVm: ListenViewModel = viewModel(owner) { ListenViewModel(container.podcastClient, { container.downloads.entries() }, { container.connectivity.isConnected.value }) }
                ListenScreen(container, listenVm, onOpenFolder = { nav.navigate(Routes.listenFolder(it)) })
            }
            composable(Routes.LISTEN_FOLDER) { entry ->
                val owner = remember(entry) { nav.getBackStackEntry(Routes.LISTEN) }
                val listenVm: ListenViewModel = viewModel(owner) { ListenViewModel(container.podcastClient, { container.downloads.entries() }, { container.connectivity.isConnected.value }) }
                ListenFolderScreen(container, listenVm, entry.arguments?.getString("id") ?: "", onBack = { nav.popBackStack() }, onOpenFolder = { nav.navigate(Routes.listenFolder(it)) })
            }
            composable(Routes.PRACTICE) { PracticeScreen(container, onOpenScenario = { nav.navigate(Routes.scenario(it)) }, onOpenCampaign = { nav.navigate(Routes.campaign(it)) }) }
            composable(Routes.SCENARIO) { entry -> ScenarioConversationScreen(container, entry.arguments?.getString("id") ?: "", onBack = { nav.popBackStack() }) }
            composable(Routes.CAMPAIGN) { entry -> CampaignConversationScreen(container, entry.arguments?.getString("id") ?: "", onBack = { nav.popBackStack() }) }
            composable(Routes.HECTOR) { HectorTab(container) }
            composable(Routes.PROFILE) {
                ProfileHubScreen(
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

    // The one-time public-name prompt covers the app until the learner saves or skips; placement follows.
    // Only a prompt that belongs to the signed-in account is ever shown.
    namePresentation?.takeIf { it.userId == userId }?.let { presentation ->
        NameOnboardingScreen(container, presentation) {
            userId?.let { flow.finish(it, OnboardingStep.DISPLAY_NAME) }
            advanceOnboarding()
        }
    }
}
