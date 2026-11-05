package com.obsidianmedia.learnwithalphonso.ui.placement

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.PlacementQuestion
import com.obsidianmedia.learnwithalphonso.core.content.placementOrder
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentPolicy
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentSurface
import com.obsidianmedia.learnwithalphonso.core.logic.AiItemMode
import com.obsidianmedia.learnwithalphonso.core.logic.TranslationGradingPolicy
import com.obsidianmedia.learnwithalphonso.core.logic.groupByBand
import com.obsidianmedia.learnwithalphonso.core.logic.BandMarker
import com.obsidianmedia.learnwithalphonso.core.logic.PlacementTally
import com.obsidianmedia.learnwithalphonso.core.logic.bandMarkers
import com.obsidianmedia.learnwithalphonso.core.logic.placementFinishedLabel
import com.obsidianmedia.learnwithalphonso.core.logic.placementMaxQuestions
import com.obsidianmedia.learnwithalphonso.core.logic.placementProgressLabel
import com.obsidianmedia.learnwithalphonso.core.logic.isPlacementAnswerCorrect
import com.obsidianmedia.learnwithalphonso.core.logic.pickPlacementSet
import com.obsidianmedia.learnwithalphonso.core.logic.playablePlacementPool
import com.obsidianmedia.learnwithalphonso.core.logic.resolveBand
import com.obsidianmedia.learnwithalphonso.core.logic.scorePlacement
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.TranslationGradingClient
import kotlinx.coroutines.Job
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
    /** The skipped bands whose synthetic credit still stands (see resolveBand): the only ones "fast-tracked" may name. */
    val skippedLevels: List<String> = emptyList(),
    /** True while the current band is a skipped one the exam went back to: always the last band it asks. */
    val revisiting: Boolean = false,
    val done: Boolean = false,
) {
    val currentQuestion: PlacementQuestion? get() = shown.getOrNull(step)
    val total: Int get() = shown.size
    val noBandsAhead: Boolean get() = placementOrder.drop(bandIdx + 1).all { bandPool[it].isNullOrEmpty() }

    /** Finishing this question is guaranteed whatever the answer: nothing lies beyond it, or it ends a band the exam went back to. */
    val isFinalQuestion: Boolean get() = step + 1 == total && (noBandsAhead || revisiting)
    val level: String get() = scorePlacement(correctByLevel).level
    val correctTotal: Int get() = answers.count { it }

    /** The longest this sitting can get, fixed by the pool: shown from the first question, never growing. */
    val maxQuestions: Int get() = placementMaxQuestions(bandPool)
    val progressLabel: String get() = placementProgressLabel(step + 1, maxQuestions)

    /** "Placed after N questions" when the exam ended before the maximum, else null. */
    val finishedLabel: String? get() = if (total < maxQuestions) placementFinishedLabel(total) else null
    val markers: List<BandMarker> get() = bandMarkers(bandPool, shown, bandIdx, PlacementTally(correctByLevel, skippedLevels, revisiting), done)
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
    /** The account's AI consent: the server grader is asked only when the learner allowed it. */
    private val hasAiConsent: () -> Boolean,
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

    /** Returns the grading job so callers (tests) can join it. */
    fun submit(): Job {
        val s = _state.value
        val picked = s.picked?.takeIf { it.isNotBlank() } ?: return NOTHING_TO_WAIT_FOR
        val q = s.currentQuestion ?: return NOTHING_TO_WAIT_FOR
        val token = attemptToken
        return viewModelScope.launch {
            var correct = isPlacementAnswerCorrect(q, picked)
            if (!correct && q is PlacementQuestion.Translate && TranslationGradingPolicy.mayAskServer(isConnected = isConnected(), hasAccessToken = true, hasAiConsent = hasAiConsent()) &&
                AiConsentPolicy.translateMode(AiConsentSurface.PLACEMENT, hasAiConsent()) == AiItemMode.AI) {
                _state.update { it.copy(checking = true) }
                val verdict = translation.gradePlacementTranslation(q.id, picked, course.code)
                if (attemptToken != token) return@launch
                _state.update { it.copy(checking = false) }
                if (verdict?.correct == true) correct = true
            }
            applyAnswer(correct)
        }
    }

    private suspend fun applyAnswer(correct: Boolean) {
        val s = _state.value
        val next = s.answers + correct
        if (s.step + 1 < s.shown.size) {
            _state.update { it.copy(answers = next, picked = null, step = it.step + 1) }
            return
        }
        // This band just finished. resolveBand owns the skip/stop rules AND what a skip's synthetic credit is worth:
        // it only stands once the band after the skip is really passed. If that band was failed the credit comes back
        // out and nextIdx points BACKWARDS, so the exam asks the skipped band instead -- a placement never rests on a
        // band the learner was never asked.
        val correctInBand = next.drop(s.bandStart).count { it }
        val resolution = resolveBand(s.bandPool, s.bandIdx, correctInBand, PlacementTally(s.correctByLevel, s.skippedLevels, s.revisiting))
        val tally = resolution.tally
        val nextLevel = placementOrder.getOrNull(resolution.nextIdx)
        val nextBand = if (!resolution.stop && nextLevel != null) s.bandPool[nextLevel].orEmpty() else emptyList()
        if (resolution.stop || nextBand.isEmpty()) {
            _state.update {
                it.copy(answers = next, picked = null, correctByLevel = tally.correctByLevel, skippedLevels = tally.skippedLevels, revisiting = tally.revisiting, done = true)
            }
            finish()
            return
        }
        _state.update {
            it.copy(
                answers = next, picked = null, correctByLevel = tally.correctByLevel, skippedLevels = tally.skippedLevels, revisiting = tally.revisiting,
                shown = it.shown + nextBand, bandIdx = resolution.nextIdx, bandStart = it.shown.size, step = it.step + 1,
            )
        }
    }

    private suspend fun finish() {
        val s = _state.value
        runCatching { client.savePlacementResult(course.code, s.level, s.correctTotal) }
    }
}

private val NOTHING_TO_WAIT_FOR: Job = Job().also { it.complete() }
