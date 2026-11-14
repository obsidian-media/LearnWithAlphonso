package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.buddy.BuddyPool
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.goal.GoalApi
import com.obsidianmedia.learnwithalphonso.core.goal.GoalPlan
import com.obsidianmedia.learnwithalphonso.core.goal.GoalRealism
import com.obsidianmedia.learnwithalphonso.core.goal.GoalStatus
import com.obsidianmedia.learnwithalphonso.core.goal.LearningGoalState
import com.obsidianmedia.learnwithalphonso.core.goal.StoredGoal
import com.obsidianmedia.learnwithalphonso.core.logic.OutOfHeartsModel
import com.obsidianmedia.learnwithalphonso.core.net.Duel
import com.obsidianmedia.learnwithalphonso.core.net.FriendActivityEvent
import com.obsidianmedia.learnwithalphonso.core.net.FriendProgress
import com.obsidianmedia.learnwithalphonso.core.net.LeaderboardRow
import com.obsidianmedia.learnwithalphonso.core.net.MyTeam
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseHttp
import com.obsidianmedia.learnwithalphonso.core.net.TeamLeaderboardRow
import com.obsidianmedia.learnwithalphonso.core.net.TeamMember
import com.obsidianmedia.learnwithalphonso.core.path.LearningPath
import com.obsidianmedia.learnwithalphonso.core.path.LearningPathChange
import com.obsidianmedia.learnwithalphonso.core.path.LearningPathDecoding
import com.obsidianmedia.learnwithalphonso.core.path.PathApi
import com.obsidianmedia.learnwithalphonso.core.team.TeamMission
import com.obsidianmedia.learnwithalphonso.core.team.TeamMissionStatus
import com.obsidianmedia.learnwithalphonso.ui.friends.BuddyUiState
import com.obsidianmedia.learnwithalphonso.ui.friends.BuddyViewModel
import com.obsidianmedia.learnwithalphonso.ui.friends.DuelsScreen
import com.obsidianmedia.learnwithalphonso.ui.friends.DuelsUiState
import com.obsidianmedia.learnwithalphonso.ui.friends.DuelsViewModel
import com.obsidianmedia.learnwithalphonso.ui.friends.FriendsScreen
import com.obsidianmedia.learnwithalphonso.ui.friends.FriendsUiState
import com.obsidianmedia.learnwithalphonso.ui.friends.FriendsViewModel
import com.obsidianmedia.learnwithalphonso.ui.learn.GoalCardViewModel
import com.obsidianmedia.learnwithalphonso.ui.league.LeaderboardPeriod
import com.obsidianmedia.learnwithalphonso.ui.league.LeaderboardScope
import com.obsidianmedia.learnwithalphonso.ui.league.LeaderboardScreen
import com.obsidianmedia.learnwithalphonso.ui.league.LeaderboardUiState
import com.obsidianmedia.learnwithalphonso.ui.league.LeaderboardViewModel
import com.obsidianmedia.learnwithalphonso.ui.league.TeamsScreen
import com.obsidianmedia.learnwithalphonso.ui.league.TeamsUiState
import com.obsidianmedia.learnwithalphonso.ui.league.TeamsViewModel
import com.obsidianmedia.learnwithalphonso.ui.lesson.OutOfHeartsContent
import com.obsidianmedia.learnwithalphonso.ui.path.PathBuildScreen
import com.obsidianmedia.learnwithalphonso.ui.path.PathViewModel
import com.obsidianmedia.learnwithalphonso.ui.review.ReviewScreen
import com.obsidianmedia.learnwithalphonso.ui.review.ReviewUiState
import com.obsidianmedia.learnwithalphonso.ui.review.ReviewViewModel
import com.obsidianmedia.learnwithalphonso.ui.settings.SettingsScreen
import io.ktor.client.engine.okhttp.OkHttp

/**
 * DEBUG builds only (RootScreen checks BuildConfig.DEBUG): one redesigned screen over made-up data, for screenshots
 * without an account (`adb shell am start -n ... --es firstRunHarness screen:duels`). Every view-model here is seeded
 * with a fixed state and never calls the network; nothing is saved. Names and numbers are invented ("Sam" is the
 * learner), the same sample learners the mocks use.
 */
@Composable
fun ScreenHarness(screen: String, container: AppContainer) {
    androidx.compose.foundation.layout.Box(androidx.compose.ui.Modifier.fillMaxSize().safeDrawingPadding()) { ScreenHarnessBody(screen, container) }
}

@Composable
private fun ScreenHarnessBody(screen: String, container: AppContainer) {
    val context = LocalContext.current
    val client = remember { ProgressSyncClient(SupabaseHttp("http://localhost", "harness", { null }, OkHttp.create { })) }
    val me = "me"
    val mina = FriendProgress("u-mina", "Mina", "animal:fox", 12, 520)
    val jon = FriendProgress("u-jon", "Jon", "j", 3, 210)
    val priya = FriendProgress("u-priya", "Priya", "animal:panda", 0, 95)
    when (screen) {
        "duels" -> DuelsScreen(
            container, {},
            DuelsViewModel(
                client, me,
                DuelsUiState(
                    isLoading = false, friends = listOf(mina, jon, priya),
                    duels = listOf(
                        Duel("d1", "u-mina", me, "fr", "pending", 0, 0, 0, 0, null, null),
                        Duel("d2", me, "u-jon", "en", "active", 100, 50, 220, 145, null, null),
                        Duel("d3", me, "u-mina", "en", "completed", 0, 0, 120, 80, me, null),
                        Duel("d4", me, "u-mina", "fr", "completed", 0, 0, 40, 90, "u-mina", null),
                        Duel("d5", me, "u-jon", "es", "completed", 0, 0, 60, 60, null, null),
                        Duel("d6", me, "u-priya", "en", "declined", 0, 0, 0, 0, null, null),
                    ),
                ),
            ),
        )
        "teams-none" -> TeamsScreen(
            container, {},
            TeamsViewModel(client, seed = TeamsUiState(isLoading = false, leaderboard = teamBoard())),
        )
        "teams-in" -> TeamsScreen(
            container, {},
            TeamsViewModel(
                client,
                seed = TeamsUiState(
                    isLoading = false, nowMillis = 0,
                    myTeam = MyTeam("t1", "Night Owls", "K7MQ2X", 0, System.currentTimeMillis() + 30L * 24 * 3600 * 1000, 340, true),
                    members = listOf(
                        TeamMember("m1", "Sam", "animal:fox", 0, true),
                        TeamMember("m2", "Mina", "animal:cat", 0, false),
                        TeamMember("m3", "Jon", "j", 0, false),
                        TeamMember("m4", "Priya", "animal:panda", 0, false, isBlocked = true),
                    ),
                    leaderboard = teamBoard(),
                ),
            ),
            TeamMission("t1", "2026-11-09", "2026-11-16", 12, 5, 2, 4, TeamMissionStatus.IN_PROGRESS, 50, false, 4, 42, "5 of 12 lessons done", "You added 2 · 4 days left"),
        )
        "league", "league-empty" -> LeaderboardScreen(
            container, {}, {}, {},
            LeaderboardViewModel(
                client, container.snapshotCache, container.recapCache, container.tierCache, me,
                seed = if (screen == "league") {
                    LeaderboardUiState(
                        scope = LeaderboardScope.GLOBAL, period = LeaderboardPeriod.WEEKLY, isLoading = false, leagueTier = "ruby", myWeekXp = 434,
                        rows = listOf(
                            LeaderboardRow("u-mina", "Mina", "GB", "animal:fox", 520), LeaderboardRow(me, "Sam", "US", "animal:cat", 434),
                            LeaderboardRow("u-jon", "Jon", "DE", "j", 210), LeaderboardRow("u-priya", "Priya", "IN", "animal:panda", 95),
                            LeaderboardRow("u-leo", "Leo", "FR", "animal:penguin", 80), LeaderboardRow("u-ana", "Ana", "ES", "animal:koala", 64),
                        ),
                    )
                } else {
                    LeaderboardUiState(scope = LeaderboardScope.FRIENDS, period = LeaderboardPeriod.WEEKLY, isLoading = false, leagueTier = "ruby", myWeekXp = 434)
                },
            ),
            me,
        )
        "friends" -> FriendsScreen(
            container, {}, {}, {},
            FriendsViewModel(
                client, container.nudgeCache, me, "https://learn.alphonsoecosystem.app",
                FriendsUiState(
                    isLoading = false, friends = listOf(mina, jon, priya), inviteLink = "https://learn.alphonsoecosystem.app/invite/ABC123",
                    activity = listOf(
                        FriendActivityEvent("e1", "u-mina", "lesson_completed", 0, xpGain = 20),
                        FriendActivityEvent("e2", "u-jon", "streak_milestone", 0, streak = 7),
                        FriendActivityEvent("e3", "u-priya", "league_promotion", 0, newTier = "sapphire"),
                    ),
                ),
            ),
            BuddyViewModel(client, BuddyUiState(isLoading = false, hasLoaded = true, pool = BuddyPool(matchingEnabled = true, waiting = false, course = null, courses = listOf("en", "es")))),
        )
        "review", "review-checked", "review-empty" -> {
            val item = ReviewItem(
                itemKey = "weakness:1", lessonId = "", level = "A1", ease = 2.5, intervalDays = 1, repetitions = 1, dueOn = "2026-11-14",
                source = "weakness", prompt = "Which is a formal greeting?", choices = listOf("Hey!", "What's up?", "Good morning.", "Yo."), answerIndex = 2,
                explanation = "\"Good morning\" is polite in any setting.",
            )
            val seed = when (screen) {
                "review" -> ReviewUiState(isLoading = false, queue = listOf(item, item.copy(itemKey = "weakness:2")), picked = "Good morning.")
                "review-checked" -> ReviewUiState(isLoading = false, queue = listOf(item, item.copy(itemKey = "weakness:2")), picked = "Good morning.", checked = true)
                else -> ReviewUiState(isLoading = false)
            }
            ReviewScreen(container, Course.ENGLISH, {}, ReviewViewModel(container.content, client, container.syncStore, { false }, Course.ENGLISH, seed = seed))
        }
        "out-of-hearts" -> OutOfHeartsContent(
            model = OutOfHeartsModel(System.currentTimeMillis() + 272_000, 0), isOnline = true, buying = false,
            buyMessage = "Not enough XP for a heart. You have 20 XP in this course.", onBuy = {}, onRefillDue = {}, onReviewInstead = {},
        )
        "path-build", "path-build-sheet", "path-build-nogoal" -> {
            val path = LearningPathDecoding.path(context.assets.open("harness/path.json").bufferedReader().readText())
            val hasGoal = screen != "path-build-nogoal"
            val goalState = if (hasGoal) {
                LearningGoalState(
                    StoredGoal("en", "B1", "2027-05-10", "2026-11-14T00:00:00Z"),
                    GoalPlan("A2", "B1", "2027-05-10", 180, 146, 6, 5, GoalStatus.ON_TRACK, GoalRealism.OK, null, "2026-11-14T00:00:00Z"),
                )
            } else {
                LearningGoalState(null, null)
            }
            val goalApi = object : GoalApi {
                override suspend fun fetch(course: String) = goalState
                override suspend fun preview(course: String, targetLevel: String, targetDate: String) =
                    GoalPlan("A2", targetLevel, targetDate, 180, 146, 6, 5, GoalStatus.ON_TRACK, GoalRealism.AMBITIOUS, null, "2026-11-14T00:00:00Z")
                override suspend fun save(course: String, targetLevel: String, targetDate: String) = goalState
                override suspend fun remove(course: String) {}
            }
            val pathApi = object : PathApi {
                override suspend fun fetch(course: String): LearningPath? = if (hasGoal) path else null
                override suspend fun change(course: String, change: LearningPathChange): LearningPath? = path
            }
            val goalVm = GoalCardViewModel(Course.ENGLISH, goalApi, container.goalCache) { me }.also { it.reload(quiet = false) }
            val pathVm = PathViewModel("en", pathApi).also { it.reload() }
            PathBuildScreen(container, {}, pathVm, goalVm, "travel", openGoalSheet = screen == "path-build-sheet")
        }
        "settings" -> SettingsScreen(container, {})
    }
}

private fun teamBoard() = listOf(
    TeamLeaderboardRow("t1", "Night Owls", 340), TeamLeaderboardRow("t2", "Coffee Club", 312),
    TeamLeaderboardRow("t3", "Verb Heroes", 288), TeamLeaderboardRow("t4", "La Familia", 150),
)
