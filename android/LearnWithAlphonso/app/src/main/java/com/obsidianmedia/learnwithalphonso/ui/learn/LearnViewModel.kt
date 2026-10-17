package com.obsidianmedia.learnwithalphonso.ui.learn

import androidx.annotation.VisibleForTesting
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Unit
import com.obsidianmedia.learnwithalphonso.core.logic.ReviewBadge
import com.obsidianmedia.learnwithalphonso.core.logic.mondayDateString
import com.obsidianmedia.learnwithalphonso.core.net.BuyStreakFreezeResult
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.WeeklyChallenge
import com.obsidianmedia.learnwithalphonso.core.net.buyStreakFreezeWithXp
import com.obsidianmedia.learnwithalphonso.core.net.claimWeeklyQuest
import com.obsidianmedia.learnwithalphonso.core.net.getWeeklyChallenges
import com.obsidianmedia.learnwithalphonso.core.sync.DeadLetterInfo
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import kotlinx.coroutines.Job
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
    val claimedChallengeIds: Set<String> = emptySet(),
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
class LearnViewModel(
    private val content: ContentStore,
    private val client: ProgressSyncClient,
    private val syncStore: SyncQueueStore,
    /** The account's remembered course, so Learn opens on it. */
    initialCourse: Course = Course.ENGLISH,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(LearnUiState(course = initialCourse))
    val state: StateFlow<LearnUiState> = _state.asStateFlow()

    val progress: StateFlow<LessonCompletionProgress?> = syncStore.progress.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val dueBadge: StateFlow<String?> = syncStore.dueCount.map(ReviewBadge::text).stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val dueCount: StateFlow<Int> = syncStore.dueCount.stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    /** Finished lessons and review answers still waiting to reach the server. */
    val pendingLessons: StateFlow<Int> = syncStore.pendingLessonCount.stateIn(viewModelScope, SharingStarted.Eagerly, 0)
    val pendingReviewAnswers: StateFlow<Int> = syncStore.pendingReviewGradeCount.stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    /** Lesson completions the server permanently rejected. */
    val deadLetters: StateFlow<List<DeadLetterInfo>> = syncStore.deadLetters.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private var loadJob: Job? = null

    /** The first load, so tests can join it instead of polling. */
    @VisibleForTesting
    val initialLoad: Job = load()

    /** Every action returns its Job so callers (tests) can join it rather than wait on a side effect. */
    fun selectCourse(course: Course): Job {
        if (course == _state.value.course) return COMPLETED
        _state.value = LearnUiState(course = course)
        return load()
    }

    /** Local band switch is instant; the server save is fire-and-forget, mirroring the web's pick(). */
    fun selectLevel(level: String): Job {
        _state.update { it.copy(selectedLevel = level) }
        val course = _state.value.course
        return viewModelScope.launch { runCatching { client.setCefrLevel(course.code, level) } }
    }

    fun refresh(): Job = load()

    /** Claims a completed challenge for this week's Monday; the reward shows as a notice. */
    fun claimChallenge(challenge: WeeklyChallenge): Job {
        val course = _state.value.course
        return viewModelScope.launch {
            val r = runCatching { client.claimWeeklyQuest(challenge.templateId, course.code, mondayDateString(0, nowMillis())) }.getOrNull()
            when {
                r == null -> _state.update { it.copy(notice = "Check your connection and try again.") }
                r.ok -> {
                    _state.update { it.copy(claimedChallengeIds = it.claimedChallengeIds + challenge.templateId, notice = "+${r.xp ?: 0} XP claimed!") }
                    runCatching { client.fetchProgress() }.getOrNull()?.let { syncStore.updateLastKnownProgress(it) }
                }
                else -> _state.update { it.copy(notice = r.reason ?: "Couldn't claim that reward.") }
            }
        }
    }

    /** Spends 50 XP on a streak freeze, same RPC the web app calls. */
    fun buyStreakFreeze(): Job {
        val course = _state.value.course
        return viewModelScope.launch {
            when (val r = runCatching { client.buyStreakFreezeWithXp(course.code) }.getOrNull()) {
                null -> _state.update { it.copy(notice = "Check your connection and try again.") }
                is BuyStreakFreezeResult.Ok -> {
                    syncStore.lastKnownProgress()?.let { p -> syncStore.updateLastKnownProgress(p.copy(streakFreezes = r.streakFreezes, xp = r.xp)) }
                    _state.update { it.copy(notice = "Streak freeze bought. You have ${r.streakFreezes}.") }
                }
                is BuyStreakFreezeResult.InsufficientXp -> _state.update { it.copy(notice = "Not enough XP. A streak freeze costs 50 XP.") }
            }
        }
    }

    fun clearNotice() = _state.update { it.copy(notice = null) }

    /** A newer load supersedes (cancels) the previous one, so nothing is left running after a course switch. */
    private fun load(): Job {
        loadJob?.cancel()
        val course = _state.value.course
        return viewModelScope.launch {
            val level = runCatching { client.fetchCefrLevel(course.code) }.getOrNull()?.takeIf { it.isNotEmpty() && LEVELS.any { l -> l.first == it } }
            val ids = runCatching { client.fetchCompletedLessonIds(course.code) }.getOrDefault(emptyList())
            val placed = runCatching { client.fetchPlacementTakenAt(course.code) }
            val challenges = runCatching { client.getWeeklyChallenges() }.getOrDefault(emptyList())
            if (_state.value.course != course) return@launch
            _state.update {
                it.copy(
                    selectedLevel = level ?: it.selectedLevel,
                    completedLessonIds = ids.toSet(),
                    mostRecentlyCompletedLessonId = ids.firstOrNull(),
                    placementTaken = placed.getOrNull()?.let { true } ?: if (placed.isSuccess) false else null,
                    challenges = challenges,
                )
            }
        }.also { loadJob = it }
    }
}
