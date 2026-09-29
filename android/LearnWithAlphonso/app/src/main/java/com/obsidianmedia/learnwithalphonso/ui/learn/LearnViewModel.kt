package com.obsidianmedia.learnwithalphonso.ui.learn

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
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
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
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(LearnUiState())
    val state: StateFlow<LearnUiState> = _state.asStateFlow()

    val progress: StateFlow<LessonCompletionProgress?> = syncStore.progress.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val dueBadge: StateFlow<String?> = syncStore.dueCount.map(ReviewBadge::text).stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val dueCount: StateFlow<Int> = syncStore.dueCount.stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    init { load() }

    fun selectCourse(course: Course) {
        if (course == _state.value.course) return
        _state.value = LearnUiState(course = course)
        load()
    }

    /** Local band switch is instant; the server save is fire-and-forget, mirroring the web's pick(). */
    fun selectLevel(level: String) {
        _state.update { it.copy(selectedLevel = level) }
        val course = _state.value.course
        viewModelScope.launch { runCatching { client.setCefrLevel(course.code, level) } }
    }

    fun refresh() = load()

    /** Claims a completed challenge for this week's Monday; the reward shows as a notice. */
    fun claimChallenge(challenge: WeeklyChallenge) {
        val course = _state.value.course
        viewModelScope.launch {
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
    fun buyStreakFreeze() {
        val course = _state.value.course
        viewModelScope.launch {
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

    private fun load() {
        val course = _state.value.course
        viewModelScope.launch {
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
        }
    }
}
