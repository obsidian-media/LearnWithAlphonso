package com.obsidianmedia.learnwithalphonso.ui

import android.annotation.SuppressLint
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
import com.obsidianmedia.learnwithalphonso.core.net.AppUpdateGate
import com.obsidianmedia.learnwithalphonso.core.net.Duel
import com.obsidianmedia.learnwithalphonso.core.net.SeasonLastWeekResult
import com.obsidianmedia.learnwithalphonso.core.net.SeasonStatus
import com.obsidianmedia.learnwithalphonso.core.net.UnlockedAchievement
import com.obsidianmedia.learnwithalphonso.core.net.WeaknessTrendEntry
import com.obsidianmedia.learnwithalphonso.ui.achievements.AchievementsScreen
import com.obsidianmedia.learnwithalphonso.ui.achievements.AchievementsUiState
import com.obsidianmedia.learnwithalphonso.ui.achievements.AchievementsViewModel
import com.obsidianmedia.learnwithalphonso.ui.league.RecapState
import com.obsidianmedia.learnwithalphonso.ui.league.SeasonScreen
import com.obsidianmedia.learnwithalphonso.ui.league.SeasonUiState
import com.obsidianmedia.learnwithalphonso.ui.league.SeasonViewModel
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
import com.obsidianmedia.learnwithalphonso.core.logic.SupportLinkId
import com.obsidianmedia.learnwithalphonso.core.logic.SupportMessage
import com.obsidianmedia.learnwithalphonso.core.logic.SupportMessageKind
import com.obsidianmedia.learnwithalphonso.core.logic.SupportStatus
import com.obsidianmedia.learnwithalphonso.core.net.SupportConversation
import com.obsidianmedia.learnwithalphonso.core.net.SupportErrorKind
import com.obsidianmedia.learnwithalphonso.core.net.SupportException
import com.obsidianmedia.learnwithalphonso.core.net.SupportUpdate
import com.obsidianmedia.learnwithalphonso.ui.support.HelpChatClient
import com.obsidianmedia.learnwithalphonso.ui.support.HelpChatContent
import com.obsidianmedia.learnwithalphonso.ui.support.HelpChatViewModel
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
import com.obsidianmedia.learnwithalphonso.core.logic.DisplayNameOnboarding
import com.obsidianmedia.learnwithalphonso.core.logic.OnboardingFlow
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordRequest
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizBest
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizOffer
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizQuestion
import com.obsidianmedia.learnwithalphonso.ui.achievements.BadgeUnlockSheet
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentDialog
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentGate
import com.obsidianmedia.learnwithalphonso.ui.listen.PodcastQuizSheet
import com.obsidianmedia.learnwithalphonso.ui.onboarding.NameOnboardingScreen
import com.obsidianmedia.learnwithalphonso.ui.placement.PlacementScreen
import com.obsidianmedia.learnwithalphonso.ui.social.BlockConfirmDialog
import com.obsidianmedia.learnwithalphonso.ui.social.ReportSheet
import com.obsidianmedia.learnwithalphonso.ui.social.SocialTarget
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordSheet
import io.ktor.client.engine.okhttp.OkHttp

/**
 * DEBUG builds only (RootScreen checks BuildConfig.DEBUG): one redesigned screen over made-up data, for screenshots
 * without an account (`adb shell am start -n ... --es firstRunHarness screen:duels`). Every view-model here is seeded
 * with a fixed state and never calls the network; nothing is saved. Names and numbers are invented ("Sam" is the
 * learner), the same sample learners the mocks use.
 */
@Composable
@SuppressLint("ViewModelConstructorInComposable")
fun ScreenHarness(screen: String, container: AppContainer) {
    androidx.compose.foundation.layout.Box(androidx.compose.ui.Modifier.fillMaxSize().safeDrawingPadding()) { ScreenHarnessBody(screen, container) }
}

@Composable
@SuppressLint("ViewModelConstructorInComposable")
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
            TeamsViewModel(client, TeamsUiState(isLoading = false, leaderboard = teamBoard())),
        )
        "teams-in" -> TeamsScreen(
            container, {},
            TeamsViewModel(
                client,
                TeamsUiState(
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
        "recap", "recap-quiet" -> LeaderboardScreen(
            container, {}, {}, {},
            LeaderboardViewModel(
                client, container.snapshotCache, container.recapCache, container.tierCache, me,
                seed = LeaderboardUiState(scope = LeaderboardScope.GLOBAL, period = LeaderboardPeriod.WEEKLY, isLoading = false, leagueTier = "silver", myWeekXp = 0),
                recapSeed = if (screen == "recap") RecapState(false, 320, 12, "silver") else RecapState(false, 0, null, null),
            ),
            me, openRecapAtStart = true,
        )
        "achievements" -> AchievementsScreen(
            container, {},
            AchievementsViewModel(
                container.content, client, seed = AchievementsUiState(
                    isLoading = false,
                    unlockedById = listOf("streak_3", "streak_7", "xp_100", "xp_500", "perfect_1", "lessons_5", "freeze_earn_1").associateWith { UnlockedAchievement(it, 1) },
                    stats = mapOf("streak" to 12, "xp" to 1240, "perfect" to 3, "lessons" to 5, "league" to 1, "freeze" to 1),
                    weaknessTrend = listOf(WeaknessTrendEntry("past-tense", 4, 1, 3, ""), WeaknessTrendEntry("articles", 3, 3, 0, "")),
                ),
            ),
        )
        "season", "season-failed" -> SeasonScreen(
            container, {},
            SeasonViewModel(
                client,
                if (screen == "season") SeasonUiState(false, SeasonStatus(3, 4, 30, SeasonLastWeekResult(3, 6, 30))) else SeasonUiState(false, null),
            ),
        )
        "update-required" -> UpdateRequiredScreen(AppUpdateGate.Requirement(storeUrl = "https://play.google.com/store/apps/details?id=com.obsidianmedia.learnwithalphonso"))
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
        "help-ai-first", "help-person-first", "help-ai", "help-team", "help-waiting", "help-solved", "help-daily-limit", "help-offline" -> {
            fun m(id: Long, kind: SupportMessageKind, body: String, at: String, link: SupportLinkId? = null) = SupportMessage(id, kind, body, at, link)
            val today = java.time.Instant.now().toString()
            val ai = screen == "help-ai-first" || screen == "help-ai"
            val msgs = when (screen) {
                "help-ai" -> listOf(
                    m(1, SupportMessageKind.YOU, "I bought Pro but it still says free", today),
                    m(2, SupportMessageKind.AI, "Open the subscription screen and tap Restore Purchases. It usually fixes this within a minute.", today, SupportLinkId.SUBSCRIPTION),
                )
                "help-team" -> listOf(
                    m(1, SupportMessageKind.YOU, "My streak vanished after the update", today),
                    m(2, SupportMessageKind.SYSTEM, "A person will reply here.", today),
                )
                "help-waiting" -> listOf(
                    m(1, SupportMessageKind.YOU, "My streak vanished after the update", today),
                    m(2, SupportMessageKind.SUPPORT, "Thanks for writing. Which course was the streak in?", today),
                )
                "help-solved" -> listOf(
                    m(1, SupportMessageKind.YOU, "My streak vanished after the update", today),
                    m(2, SupportMessageKind.SUPPORT, "We restored it. Sorry about that.", today),
                    m(3, SupportMessageKind.SYSTEM, "This chat was marked solved.", today),
                )
                else -> emptyList()
            }
            val status = when (screen) {
                "help-team" -> SupportStatus.OPEN
                "help-waiting" -> SupportStatus.WAITING_LEARNER
                "help-solved" -> SupportStatus.SOLVED
                "help-ai" -> SupportStatus.AI
                else -> SupportStatus.NONE
            }
            val fake = object : HelpChatClient {
                override suspend fun fetchConversation() = SupportConversation(status, if (screen == "help-waiting") 1 else 0, msgs, ai)
                override suspend fun send(text: String, clientId: String) = SupportUpdate(status, emptyList())
                override suspend fun handoff() = SupportUpdate(SupportStatus.NEW, emptyList())
            }
            val limited = screen == "help-daily-limit"
            val limitedFake = object : HelpChatClient {
                override suspend fun fetchConversation() = SupportConversation(SupportStatus.OPEN, 0, listOf(m(1, SupportMessageKind.YOU, "Earlier message", today)), false)
                override suspend fun send(text: String, clientId: String): SupportUpdate = throw SupportException(SupportErrorKind.DAILY_LIMIT)
                override suspend fun handoff() = SupportUpdate(SupportStatus.OPEN, emptyList())
            }
            val shown = remember { HelpChatViewModel(if (limited) limitedFake else fake) }
            if (limited) androidx.compose.runtime.LaunchedEffect(Unit) { kotlinx.coroutines.delay(600); shown.setDraft("hello"); shown.send(true) }
            HelpChatContent(shown, online = screen != "help-offline", aiDeclined = false, parent = "Settings", onBack = {}, onOpenLink = {})
        }
        "settings" -> SettingsScreen(container, {}, {})
        "save-word" -> SaveWordSheet(container, SaveWordRequest("café", "Un café, por favor.", "es"), {})
        "podcast-quiz" -> PodcastQuizSheet(
            container, "Kitchen Talk 2", "ep1",
            PodcastQuizOffer(
                listOf(
                    PodcastQuizQuestion("q1", "What does the cook ask for first?", listOf("Salt", "A pan", "The menu", "Water"), 1),
                    PodcastQuizQuestion("q2", "Where is the cook?", listOf("At home", "In a kitchen", "At school"), 1),
                ),
                PodcastQuizBest(1, 10),
            ),
            {}, {},
        )
        "placement" -> PlacementScreen(container, Course.ENGLISH, {})
        "name-prompt" -> NameOnboardingScreen(container, OnboardingFlow.NamePresentation(1, me, DisplayNameOnboarding.start("", "Learner4821")), {})
        "ai-consent" -> AiConsentDialog(container.aiConsent, {}, {})
        "ai-gate" -> AiConsentGate(container) { androidx.compose.material3.Text("Hector") }
        "report", "report-team" -> ReportSheet(if (screen == "report") SocialTarget("u-mina", "Mina") else SocialTarget("t3", "Verb Heroes", isTeamName = true), container, {})
        "offline-finish" -> com.obsidianmedia.learnwithalphonso.ui.lesson.OfflineFinishScreen("Saved on this phone. It will sync when you are back online.", 40, 7, 8)
        "block" -> BlockConfirmDialog(SocialTarget("u-mina", "Mina"), {}, {})
        "unlock", "unlock-two" -> BadgeUnlockSheet(container.content.achievements.filter { it.id in (if (screen == "unlock") listOf("streak_30") else listOf("streak_30", "xp_500")) }, {}, {})
    }
}

private fun teamBoard() = listOf(
    TeamLeaderboardRow("t1", "Night Owls", 340), TeamLeaderboardRow("t2", "Coffee Club", 312),
    TeamLeaderboardRow("t3", "Verb Heroes", 288), TeamLeaderboardRow("t4", "La Familia", 150),
)
