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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.auth.AuthState
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.ui.auth.AuthScreen
import com.obsidianmedia.learnwithalphonso.ui.learn.LearnScreen
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonScreen
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
fun RootScreen(container: AppContainer) {
    val session = container.session
    val isRestoring by session.isRestoring.collectAsState()
    val state by session.state.collectAsState()
    val palette = AlphonsoColor.palette

    LaunchedEffect(Unit) { session.restore() }

    Box(Modifier.fillMaxSize().background(palette.surface)) {
        when {
            isRestoring -> Unit
            state !is AuthState.SignedIn -> AuthScreen(container)
            else -> SignedInApp(container)
        }
    }
}

@Composable
private fun SignedInApp(container: AppContainer) {
    val nav = rememberNavController()
    val palette = AlphonsoColor.palette
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    val showBar = currentRoute in Routes.tabs
    val userId = container.session.userId

    LaunchedEffect(userId) {
        container.syncCoordinator.triggerSync()
        runCatching { userId?.let { container.progressClient.fetchProfileTheme(it) } }.getOrNull()?.let(container.themeManager::hydrateFromServer)
        val placed = runCatching { container.progressClient.fetchPlacementTakenAt("en") }.getOrNull()
        if (placed == null && runCatching { container.progressClient.fetchCefrLevel("en") }.isSuccess) {
            nav.navigate(Routes.placement("en"))
        }
    }

    Scaffold(
        containerColor = palette.surface,
        bottomBar = {
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
            composable(Routes.LISTEN) { PlaceholderTab("Listen", "Podcasts arrive in the next release.") }
            composable(Routes.PRACTICE) { PlaceholderTab("Practice", "Conversation practice arrives in the next release.") }
            composable(Routes.HECTOR) { PlaceholderTab("Hector", "Your AI tutor arrives in the next release.") }
            composable(Routes.PROFILE) { PlaceholderTab("Profile", "Leaderboards, friends and achievements arrive in the next release.") }
            composable(Routes.LESSON) { entry ->
                val course = Course.fromCode(entry.arguments?.getString("course") ?: "en")
                val lessonId = entry.arguments?.getString("lessonId") ?: ""
                LessonScreen(container, course, lessonId, onExit = { nav.popBackStack() })
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
}
