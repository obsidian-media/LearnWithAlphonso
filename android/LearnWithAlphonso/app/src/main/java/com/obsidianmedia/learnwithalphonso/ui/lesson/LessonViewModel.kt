package com.obsidianmedia.learnwithalphonso.ui.lesson

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Lesson
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.logic.TranslationAnswer
import com.obsidianmedia.learnwithalphonso.core.logic.VocabItem
import com.obsidianmedia.learnwithalphonso.core.logic.computeXpGain
import com.obsidianmedia.learnwithalphonso.core.logic.deriveVocab
import com.obsidianmedia.learnwithalphonso.core.logic.isAnswerCorrect
import com.obsidianmedia.learnwithalphonso.core.logic.pickReinforcementQuestion
import com.obsidianmedia.learnwithalphonso.core.net.LessonAnswer
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionResult
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.TranslationGradingClient
import com.obsidianmedia.learnwithalphonso.core.net.TranslationVerdict
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

sealed interface LessonPhase {
    data object Overview : LessonPhase
    data object Vocab : LessonPhase
    data object Quiz : LessonPhase
    data class Finished(val result: LessonCompletionResult, val isLeaguePromotion: Boolean) : LessonPhase
    data class QueuedOffline(val pending: PendingLessonCompletion) : LessonPhase
    data class Error(val message: String) : LessonPhase
}

data class LessonUiState(
    val lesson: Lesson,
    val phase: LessonPhase = LessonPhase.Overview,
    val idx: Int = 0,
    val picked: String? = null,
    val checked: Boolean = false,
    val correctCount: Int = 0,
    val answers: List<LessonAnswer> = emptyList(),
    val activeReinforcement: Question? = null,
    val pendingReinforcement: Question? = null,
    val translationVerdict: TranslationVerdict? = null,
    val isChecking: Boolean = false,
    val isSubmitting: Boolean = false,
) {
    val total: Int get() = lesson.questions.size
    val isReinforcing: Boolean get() = activeReinforcement != null
    val currentQuestion: Question get() = activeReinforcement ?: lesson.questions[idx]
    val continueLabel: String get() = if (isReinforcing || pendingReinforcement != null || idx < total - 1) "Continue" else "Finish"
    val lastCheckedCorrect: Boolean? get() = if (!checked) null else translationVerdict?.correct
}

/**
 * Port of LessonPlayerView.swift's state machine. Reinforcement questions
 * never enter `answers` (Review Focus 5); a wrong answer spends a heart
 * locally and on the server; finishing offline queues the completion.
 */
class LessonViewModel(
    lesson: Lesson,
    private val course: Course,
    private val content: ContentStore,
    private val client: ProgressSyncClient,
    private val translation: TranslationGradingClient,
    private val syncStore: SyncQueueStore,
    private val isConnected: () -> Boolean,
    private val lastKnownTier: () -> String?,
    private val rememberTier: (String) -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(LessonUiState(lesson))
    val state: StateFlow<LessonUiState> = _state.asStateFlow()
    private var attemptSeed = UUID.randomUUID().toString()

    val vocab: List<VocabItem> get() = deriveVocab(_state.value.lesson, content.vocabImages)

    private val unit get() = content.findLesson(_state.value.lesson.id, course)?.first
    private val siblingQuestions: List<Question>
        get() = (unit?.lessons ?: emptyList()).filter { it.id != _state.value.lesson.id }.flatMap { it.questions }
    private val levelQuestions: List<Question>
        get() = content.bundle(course).units.filter { it.level == unit?.level && it.id != unit?.id }.flatMap { u -> u.lessons.flatMap { it.questions } }

    val nextLessonId: String?
        get() {
            val u = unit ?: return null
            val lessonId = _state.value.lesson.id
            val i = u.lessons.indexOfFirst { it.id == lessonId }
            if (i >= 0 && i + 1 < u.lessons.size) return u.lessons[i + 1].id
            val sameLevel = content.bundle(course).units.filter { it.level == u.level }
            val ui = sameLevel.indexOfFirst { it.id == u.id }
            return sameLevel.getOrNull(ui + 1)?.lessons?.firstOrNull()?.id
        }

    fun begin() = _state.update { it.copy(phase = if (vocab.isEmpty()) LessonPhase.Quiz else LessonPhase.Vocab) }
    fun startPractice() = _state.update { it.copy(phase = LessonPhase.Quiz) }
    fun pick(value: String?) = _state.update { if (it.checked) it else it.copy(picked = value) }

    fun check() {
        val s = _state.value
        if (s.checked || s.picked.isNullOrBlank()) return
        val q = s.currentQuestion
        if (q is Question.Translate) {
            _state.update { it.copy(isChecking = true) }
            viewModelScope.launch {
                val verdict = settleTranslation(q, s.picked)
                _state.update { it.copy(isChecking = false, checked = true, translationVerdict = verdict) }
                recordAnswer()
            }
        } else {
            _state.update { it.copy(checked = true) }
            recordAnswer()
        }
    }

    fun continueOrFinish() {
        val s = _state.value
        if (!s.checked) return
        if (s.pendingReinforcement != null) {
            _state.update { it.copy(activeReinforcement = it.pendingReinforcement, pendingReinforcement = null, picked = null, checked = false, translationVerdict = null) }
            return
        }
        if (s.activeReinforcement != null) {
            _state.update { it.copy(activeReinforcement = null) }
        }
        if (s.idx < s.total - 1) {
            _state.update { it.copy(idx = it.idx + 1, picked = null, checked = false, translationVerdict = null) }
        } else {
            viewModelScope.launch { finish() }
        }
    }

    fun continueToNextLesson() {
        val next = nextLessonId ?: return
        val found = content.findLesson(next, course) ?: return
        attemptSeed = UUID.randomUUID().toString()
        _state.value = LessonUiState(found.second)
    }

    /** True when the current answer is correct, for the explanation block; translate uses the settled verdict. */
    fun isCurrentCorrect(): Boolean {
        val s = _state.value
        return s.translationVerdict?.correct ?: isAnswerCorrect(s.currentQuestion, s.picked, course)
    }

    private suspend fun settleTranslation(q: Question.Translate, picked: String?): TranslationVerdict {
        val submission = (picked ?: "").trim()
        if (TranslationAnswer.matches(submission, q.acceptableAnswers)) return TranslationVerdict(true, null)
        if (!isConnected()) return TranslationVerdict(false, null)
        return translation.gradeLessonTranslation(_state.value.lesson.id, q.id, submission, course.code) ?: TranslationVerdict(false, null)
    }

    private fun recordAnswer() {
        val s = _state.value
        if (s.isReinforcing) return
        val question = s.lesson.questions[s.idx]
        val correct = if (question is Question.Translate && s.translationVerdict != null) s.translationVerdict.correct else isAnswerCorrect(question, s.picked, course)
        val answers = s.answers + LessonAnswer(question.id, s.picked ?: "")
        if (correct) {
            _state.update { it.copy(answers = answers, correctCount = it.correctCount + 1) }
        } else {
            val doingWell = s.idx > 0 && s.correctCount.toDouble() / s.idx >= 0.8
            val reinforcement = pickReinforcementQuestion(siblingQuestions, levelQuestions, doingWell, "$attemptSeed-reinforce-${s.idx}")
            _state.update { it.copy(answers = answers, pendingReinforcement = reinforcement) }
            spendHeart()
        }
    }

    private fun spendHeart() {
        viewModelScope.launch {
            syncStore.lastKnownProgress()?.takeIf { it.hearts > 0 }?.let { syncStore.updateLastKnownProgress(it.copy(hearts = it.hearts - 1)) }
            runCatching { client.loseHeart() }
        }
    }

    private suspend fun finish() {
        val s = _state.value
        _state.update { it.copy(isSubmitting = true) }
        try {
            if (!isConnected()) { queueOffline(); return }
            val token = client.startLessonSession(s.lesson.id, course.code)
            val result = client.completeLesson(s.lesson.id, s.total, s.answers, course.code, token)
            val previousTier = lastKnownTier()
            rememberTier(result.progress.leagueTier)
            val promoted = previousTier != null && previousTier != result.progress.leagueTier
            syncStore.updateLastKnownProgress(result.progress)
            _state.update { it.copy(phase = LessonPhase.Finished(result, promoted)) }
        } catch (e: Exception) {
            queueOffline()
        } finally {
            _state.update { it.copy(isSubmitting = false) }
        }
    }

    private suspend fun queueOffline() {
        val s = _state.value
        val pending = PendingLessonCompletion(s.lesson.id, s.total, s.answers, course.code, now(), computeXpGain(s.correctCount, s.total))
        syncStore.appendLessonCompletion(pending)
        _state.update { it.copy(phase = LessonPhase.QueuedOffline(pending)) }
    }
}
