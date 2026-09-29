package com.obsidianmedia.learnwithalphonso.ui.placement

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.PlacementQuestion
import com.obsidianmedia.learnwithalphonso.core.content.placementOrder
import com.obsidianmedia.learnwithalphonso.core.logic.groupByBand
import com.obsidianmedia.learnwithalphonso.core.logic.isPlacementAnswerCorrect
import com.obsidianmedia.learnwithalphonso.core.logic.nextAdaptiveBand
import com.obsidianmedia.learnwithalphonso.core.logic.pickPlacementSet
import com.obsidianmedia.learnwithalphonso.core.logic.playablePlacementPool
import com.obsidianmedia.learnwithalphonso.core.logic.scorePlacement
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.TranslationGradingClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.random.Random

val LEVEL_META: Map<String, Pair<String, String>> = mapOf(
    "A1" to ("Beginner" to "Greetings, basics, everyday routines."),
    "A2" to ("Elementary" to "Past tense, shopping, travel talk."),
    "B1" to ("Intermediate" to "Opinions, conditionals, work life."),
    "B2" to ("Upper Int." to "Nuance, passives, debate language."),
    "C1" to ("Advanced" to "Idiom, register, academic precision."),
)

data class PlacementUiState(
    val bandPool: Map<String, List<PlacementQuestion>> = emptyMap(),
    val shown: List<PlacementQuestion> = emptyList(),
    val bandIdx: Int = 0,
    val bandStart: Int = 0,
    val step: Int = 0,
    val picked: String? = null,
    val checking: Boolean = false,
    val answers: List<Boolean> = emptyList(),
    val correctByLevel: Map<String, Int> = emptyMap(),
    val skippedLevels: List<String> = emptyList(),
    val done: Boolean = false,
) {
    val currentQuestion: PlacementQuestion? get() = shown.getOrNull(step)
    val total: Int get() = shown.size
    val noBandsAhead: Boolean get() = placementOrder.drop(bandIdx + 1).all { bandPool[it].isNullOrEmpty() }
    val isFinalQuestion: Boolean get() = step + 1 == total && noBandsAhead
    val level: String get() = scorePlacement(correctByLevel).level
    val correctTotal: Int get() = answers.count { it }
}

/** Port of PlacementView.swift's adaptive walk over the bands. */
class PlacementViewModel(
    private val content: ContentStore,
    private val client: ProgressSyncClient,
    private val translation: TranslationGradingClient,
    private val course: Course,
    private val canPlayAudio: Boolean = true,
    private val isConnected: () -> Boolean = { true },
    private val random: Random = Random.Default,
) : ViewModel() {
    private val _state = MutableStateFlow(freshAttempt())
    val state: StateFlow<PlacementUiState> = _state.asStateFlow()
    private var attemptToken = 0

    private fun freshAttempt(): PlacementUiState {
        val grouped = groupByBand(pickPlacementSet(playablePlacementPool(content.placementPool(course), canPlayAudio), random))
        var idx = 0
        while (idx < placementOrder.size && grouped[placementOrder[idx]].isNullOrEmpty()) idx++
        return PlacementUiState(bandPool = grouped, shown = if (idx < placementOrder.size) grouped[placementOrder[idx]].orEmpty() else emptyList(), bandIdx = idx)
    }

    fun pick(value: String?) = _state.update { it.copy(picked = value) }

    fun restart() {
        attemptToken++
        _state.value = freshAttempt()
    }

    fun submit() {
        val s = _state.value
        val picked = s.picked?.takeIf { it.isNotBlank() } ?: return
        val q = s.currentQuestion ?: return
        val token = attemptToken
        viewModelScope.launch {
            var correct = isPlacementAnswerCorrect(q, picked)
            if (!correct && q is PlacementQuestion.Translate && isConnected()) {
                _state.update { it.copy(checking = true) }
                val verdict = translation.gradePlacementTranslation(q.id, picked, course.code)
                if (attemptToken != token) return@launch
                _state.update { it.copy(checking = false) }
                if (verdict?.correct == true) correct = true
            }
            applyAnswer(q, correct)
        }
    }

    private suspend fun applyAnswer(q: PlacementQuestion, correct: Boolean) {
        val s = _state.value
        val next = s.answers + correct
        if (s.step + 1 < s.shown.size) {
            _state.update { it.copy(answers = next, picked = null, step = it.step + 1) }
            return
        }
        val correctInBand = next.drop(s.bandStart).count { it }
        val correctByLevel = s.correctByLevel + (q.level to correctInBand)
        val decision = nextAdaptiveBand(s.bandPool, s.bandIdx, correctInBand)
        val skipped = s.skippedLevels + listOfNotNull(decision.skipped)
        val withSkip = decision.skipped?.let { correctByLevel + (it to 2) } ?: correctByLevel
        val nextLevel = placementOrder.getOrNull(decision.nextIdx)
        val nextBand = if (!decision.stop && nextLevel != null) s.bandPool[nextLevel].orEmpty() else emptyList()
        if (decision.stop || nextBand.isEmpty()) {
            _state.update { it.copy(answers = next, picked = null, correctByLevel = withSkip, skippedLevels = skipped, done = true) }
            finish()
            return
        }
        _state.update {
            it.copy(
                answers = next, picked = null, correctByLevel = withSkip, skippedLevels = skipped,
                shown = it.shown + nextBand, bandIdx = decision.nextIdx, bandStart = it.shown.size, step = it.step + 1,
            )
        }
    }

    private suspend fun finish() {
        val s = _state.value
        runCatching { client.savePlacementResult(course.code, s.level, s.correctTotal) }
    }
}
