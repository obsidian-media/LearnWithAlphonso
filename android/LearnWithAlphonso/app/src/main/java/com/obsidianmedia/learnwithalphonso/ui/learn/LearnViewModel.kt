package com.obsidianmedia.learnwithalphonso.ui.learn

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Unit
import com.obsidianmedia.learnwithalphonso.core.logic.ReviewBadge
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** The five CEFR bands, same ids, order and names as src/data/levels.ts. */
val LEVELS: List<Pair<String, String>> = listOf("A1" to "Beginner", "A2" to "Elementary", "B1" to "Intermediate", "B2" to "Upper Int.", "C1" to "Advanced")

data class LearnUiState(
    val course: Course = Course.ENGLISH,
    val selectedLevel: String = "A1",
    val completedLessonIds: Set<String> = emptySet(),
    val mostRecentlyCompletedLessonId: String? = null,
    val placementTaken: Boolean? = null,
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

/** Port of LessonBrowserView.swift's state: course, band, completion dots and the review badge. */
class LearnViewModel(
    private val content: ContentStore,
    private val client: ProgressSyncClient,
    syncStore: SyncQueueStore,
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
        _state.value = _state.value.copy(selectedLevel = level)
        val course = _state.value.course
        viewModelScope.launch { runCatching { client.setCefrLevel(course.code, level) } }
    }

    fun refresh() = load()

    private fun load() {
        val course = _state.value.course
        viewModelScope.launch {
            val level = runCatching { client.fetchCefrLevel(course.code) }.getOrNull()?.takeIf { it.isNotEmpty() && LEVELS.any { l -> l.first == it } }
            val ids = runCatching { client.fetchCompletedLessonIds(course.code) }.getOrDefault(emptyList())
            val placed = runCatching { client.fetchPlacementTakenAt(course.code) }
            if (_state.value.course != course) return@launch
            _state.value = _state.value.copy(
                selectedLevel = level ?: _state.value.selectedLevel,
                completedLessonIds = ids.toSet(),
                mostRecentlyCompletedLessonId = ids.firstOrNull(),
                placementTaken = placed.getOrNull()?.let { true } ?: if (placed.isSuccess) false else null,
            )
        }
    }
}
