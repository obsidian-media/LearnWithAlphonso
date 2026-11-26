package com.obsidianmedia.learnwithalphonso.ui.learn

import androidx.annotation.VisibleForTesting
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Unit
import com.obsidianmedia.learnwithalphonso.core.logic.LevelSave
import com.obsidianmedia.learnwithalphonso.core.logic.ReviewBadge
import com.obsidianmedia.learnwithalphonso.core.logic.mondayDateString
import com.obsidianmedia.learnwithalphonso.core.logic.weeklyQuestClaimMessage
import com.obsidianmedia.learnwithalphonso.core.net.BuyStreakFreezeResult
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.WeeklyChallenge
import com.obsidianmedia.learnwithalphonso.core.net.WeeklyQuest
import com.obsidianmedia.learnwithalphonso.core.net.buyStreakFreezeWithXp
import com.obsidianmedia.learnwithalphonso.core.net.claimWeeklyQuest
import com.obsidianmedia.learnwithalphonso.core.net.getWeeklyChallenges
import com.obsidianmedia.learnwithalphonso.core.net.getWeeklyQuests
import com.obsidianmedia.learnwithalphonso.core.sync.DeadLetterInfo
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The five CEFR bands, same ids, order and names as src/data/levels.ts. */
val LEVELS: List<Pair<String, String>> = listOf("A1" to "Beginner", "A2" to "Elementary", "B1" to "Intermediate", "B2" to "Upper Int.", "C1" to "Advanced")

private val COMPLETED: Job = Job().also { it.complete() }

data class LearnUiState(
    val course: Course = Course.ENGLISH,
    val selectedLevel: String = "A1",
    val completedLessonIds: Set<String> = emptySet(),
    val mostRecentlyCompletedLessonId: String? = null,
    val placementTaken: Boolean? = null,
    val challenges: List<WeeklyChallenge> = emptyList(),
    /** This week's weekly_quests (claimable XP rewards), separate from [challenges], which award themselves. */
    val quests: List<WeeklyQuest> = emptyList(),
    /** The last read of the weekly challenges or quests failed: the card says so with Try again, and keeps what it had. */
    val weeklyLoadFailed: Boolean = false,
    val notice: String? = null,
) {
    fun unitsForLevel(content: ContentStore): List<Unit> = content.bundle(course).units.filter { it.level == selectedLevel }

    /** The lesson right after the most recently completed one in this band, or null. */
    fun continueLessonId(content: ContentStore): String? {
        val flattened = unitsForLevel(content).flatMap { it.lessons }
        val recent = mostRecentlyCompletedLessonId ?: return null
        val idx = flattened.indexOfFirst { it.id == recent }
        if (idx < 0) return null
        return flattened.drop(idx + 1).firstOrNull { it.id !in completedLessonIds }?.id
    }
}

/** Port of LessonBrowserView.swift's state plus the weekly challenges card and the streak-freeze purchase. */
/** What `buy_streak_freeze_with_xp` charges (the server decides; web's XP_STREAK_FREEZE_COST is the same). Display only. */
const val STREAK_FREEZE_XP_COST = 75

class LearnViewModel(
    private val content: ContentStore,
    private val client: ProgressSyncClient,
    private val syncStore: SyncQueueStore,
    /** The account's remembered course, so Learn opens on it. */
    initialCourse: Course = Course.ENGLISH,
    /** The signed-in account: queued work and lost lessons are shown for this account only. */
    userId: String? = null,
    /** Between the level save's tries ([LevelSave]); tests pass a no-op. Before [nowMillis], the trailing lambda. */
    private val levelSavePause: suspend (Int) -> kotlin.Unit = { delay(it * 1_000L) },
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(LearnUiState(course = initialCourse))
    val state: StateFlow<LearnUiState> = _state.asStateFlow()

    val progress: StateFlow<LessonCompletionProgress?> = syncStore.progress.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val dueBadge: StateFlow<String?> = syncStore.dueCount.map(ReviewBadge::text).stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val dueCount: StateFlow<Int> = syncStore.dueCount.stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    /** Finished lessons and review answers still waiting to reach the server. */
    val pendingLessons: StateFlow<Int> = syncStore.pendingLessonCount(userId).stateIn(viewModelScope, SharingStarted.Eagerly, 0)
    val pendingReviewAnswers: StateFlow<Int> = syncStore.pendingReviewGradeCount(userId).stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    /** Lesson completions the server permanently rejected. */
    val deadLetters: StateFlow<List<DeadLetterInfo>> = syncStore.lessonDeadLetters(userId).stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private var loadJob: Job? = null

    /** The level the server holds for this course, as last read or saved; null until known. */
    private var savedLevel: String? = null
    private var levelSave: Pair<Course, Job>? = null
    /** Counts picks, so only the newest acts on its result and a level read before a pick never overrides it. */
    private var levelPicks = 0

    /** The first load, so tests can join it instead of polling. */
    @VisibleForTesting
    val initialLoad: Job = load()

    /** Every action returns its Job so callers (tests) can join it rather than wait on a side effect. */
    fun selectCourse(course: Course): Job {
        if (course == _state.value.course) return COMPLETED
        _state.value = LearnUiState(course = course)
        savedLevel = null
        // A save still out for the course left keeps going; coming back, the load and that save's result settle it.
        levelSave = null
        return load()
    }

    /**
     * The band switch is instant. The saved level is what start-lesson-session opens lessons from, so a lost save
     * would leave the map offering lessons the server refuses: the save is retried ([LevelSave]), and if it still fails
     * the picker goes back to the level the server holds, with a notice. A newer pick replaces one still saving.
     */
    fun selectLevel(level: String): Job {
        val before = _state.value.selectedLevel
        _state.update { it.copy(selectedLevel = level) }
        val course = _state.value.course
        levelSave?.let { (c, job) -> if (c == course) job.cancel() }
        val pick = ++levelPicks
        val job = viewModelScope.launch {
            val saved = LevelSave.run(pause = levelSavePause) { client.setCefrLevel(course.code, level) }
            if (pick != levelPicks || _state.value.course != course) return@launch
            if (saved) {
                savedLevel = level
                // Back on this course after leaving it mid-save, the load showed the level it read before this landed.
                if (_state.value.selectedLevel != level) _state.update { it.copy(selectedLevel = level) }
            } else if (_state.value.selectedLevel == level) {
                _state.update { it.copy(selectedLevel = savedLevel ?: before, notice = LevelSave.FAILED_MESSAGE) }
            }
        }
        levelSave = course to job
        return job
    }

    fun refresh(): Job = load()

    /**
     * Claims a finished weekly quest for this week's Monday; the reward shows as a notice. Weekly challenges have no
     * claim (get_weekly_challenges pays them when read), so only a [WeeklyQuest] id ever goes to claim_weekly_quest.
     */
    fun claimQuest(quest: WeeklyQuest): Job {
        val course = _state.value.course
        // A second tap while the first claim is out, or on a quest already claimed, sends nothing.
        if (_state.value.quests.firstOrNull { it.id == quest.id }?.claimed == true) return COMPLETED
        if (!claimingQuestIds.add(quest.id)) return COMPLETED
        return viewModelScope.launch {
            try {
                claimQuestNow(quest, course)
            } finally {
                claimingQuestIds.remove(quest.id)
            }
        }
    }

    /** Quest ids with a claim in flight (main thread only). */
    private val claimingQuestIds = mutableSetOf<String>()

    private suspend fun claimQuestNow(quest: WeeklyQuest, course: Course) {
        run {
            val outcome = runCatching { client.claimWeeklyQuest(quest.id, course.code, mondayDateString(0, nowMillis())) }.getOrNull()
            when {
                // Only a real failure to reach the server; a refusal from it (below) is never this message.
                outcome == null -> _state.update { it.copy(notice = "Check your connection and try again.") }
                outcome.ok -> {
                    _state.update { it.copy(quests = it.quests.map { q -> if (q.id == quest.id) q.copy(claimed = true) else q }, notice = "+${quest.xpReward} XP claimed!") }
                    runCatching { client.fetchProgress() }.getOrNull()?.let { syncStore.updateLastKnownProgress(it) }
                }
                else -> {
                    _state.update { it.copy(notice = weeklyQuestClaimMessage(outcome.reason)) }
                    // Already claimed elsewhere, or the week turned over: the list on screen is stale.
                    if (outcome.reason == "already-claimed" || outcome.reason == "invalid-week") reloadQuests(course)
                }
            }
        }
    }

    private suspend fun reloadQuests(course: Course) {
        val quests = runCatching { client.getWeeklyQuests(course.code, mondayDateString(0, nowMillis())) }.getOrNull() ?: return
        if (_state.value.course == course) _state.update { it.copy(quests = quests) }
    }

    /** Spends [STREAK_FREEZE_XP_COST] XP on a streak freeze, same RPC the web app calls. */
    fun buyStreakFreeze(): Job {
        val course = _state.value.course
        return viewModelScope.launch {
            when (val r = runCatching { client.buyStreakFreezeWithXp(course.code) }.getOrNull()) {
                null -> _state.update { it.copy(notice = "Check your connection and try again.") }
                is BuyStreakFreezeResult.Ok -> {
                    syncStore.lastKnownProgress()?.let { p -> syncStore.updateLastKnownProgress(p.copy(streakFreezes = r.streakFreezes, xp = r.xp)) }
                    _state.update { it.copy(notice = "Streak freeze bought. You have ${r.streakFreezes}.") }
                }
                is BuyStreakFreezeResult.InsufficientXp -> _state.update { it.copy(notice = "Not enough XP. A streak freeze costs $STREAK_FREEZE_XP_COST XP.") }
            }
        }
    }

    fun clearNotice() = _state.update { it.copy(notice = null) }

    /** A newer load supersedes (cancels) the previous one, so nothing is left running after a course switch. */
    private fun load(): Job {
        loadJob?.cancel()
        val course = _state.value.course
        val picksBefore = levelPicks
        return viewModelScope.launch {
            val level = runCatching { client.fetchCefrLevel(course.code) }.getOrNull()?.takeIf { it.isNotEmpty() && LEVELS.any { l -> l.first == it } }
            val ids = runCatching { client.fetchCompletedLessonIds(course.code) }.getOrDefault(emptyList())
            val placed = runCatching { client.fetchPlacementTakenAt(course.code) }
            val challengesRead = runCatching { client.getWeeklyChallenges() }
            val questsRead = runCatching { client.getWeeklyQuests(course.code, mondayDateString(0, nowMillis())) }
            if (_state.value.course != course) return@launch
            // A pick made while this read was out, or still saving, outranks the level it read.
            val saving = levelSave?.let { (c, job) -> c == course && job.isActive } == true
            val fresh = picksBefore == levelPicks && !saving
            if (fresh && level != null) savedLevel = level
            _state.update {
                it.copy(
                    selectedLevel = if (fresh) level ?: it.selectedLevel else it.selectedLevel,
                    completedLessonIds = ids.toSet(),
                    mostRecentlyCompletedLessonId = ids.firstOrNull(),
                    placementTaken = placed.getOrNull()?.let { true } ?: if (placed.isSuccess) false else null,
                    // A failed read keeps the last good list (never "nothing this week") and raises the retry.
                    challenges = challengesRead.getOrNull() ?: it.challenges,
                    quests = questsRead.getOrNull() ?: it.quests,
                    weeklyLoadFailed = challengesRead.isFailure || questsRead.isFailure,
                )
            }
        }.also { loadJob = it }
    }
}
