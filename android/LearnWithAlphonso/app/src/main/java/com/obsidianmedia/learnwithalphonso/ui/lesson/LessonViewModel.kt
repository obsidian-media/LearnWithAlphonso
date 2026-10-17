package com.obsidianmedia.learnwithalphonso.ui.lesson

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Lesson
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.logic.HeartsEconomy
import com.obsidianmedia.learnwithalphonso.core.logic.OutOfHeartsModel
import com.obsidianmedia.learnwithalphonso.core.logic.TranslationAnswer
import com.obsidianmedia.learnwithalphonso.core.logic.VocabItem
import com.obsidianmedia.learnwithalphonso.core.logic.computeXpGain
import com.obsidianmedia.learnwithalphonso.core.logic.deriveVocab
import com.obsidianmedia.learnwithalphonso.core.logic.isAnswerCorrect
import com.obsidianmedia.learnwithalphonso.core.logic.pickReinforcementQuestion
import com.obsidianmedia.learnwithalphonso.core.net.BuyHeartResult
import com.obsidianmedia.learnwithalphonso.core.net.LessonAnswer
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionResult
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncError
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
    /** Non-null while the hearts gate blocks this lesson: the out-of-hearts screen replaces the lesson. */
    val outOfHearts: OutOfHeartsModel? = null,
    val buyingHeart: Boolean = false,
    val buyMessage: String? = null,
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
    /** The start-lesson-session token taken when the lesson opened; finish() mints one if none is held. */
    private var sessionToken: String? = null

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

    /**
     * The lesson session starts when the lesson opens, which is where the server's hearts gate applies
     * (start-lesson-session's 409). Offline, the cached hearts decide with the same rule (HeartsEconomy.gate).
     * Any other failure is not fatal: finish() starts a session itself when none is held.
     */
    fun openSession() {
        viewModelScope.launch { openSessionNow() }
    }

    private var opened = false

    /** Called by the screen when it first shows; the view model survives rotation, so this opens one session. */
    fun onScreenShown() {
        if (opened) return
        opened = true
        openSession()
    }

    private suspend fun openSessionNow() {
        sessionToken = null
        if (!isConnected()) {
            val cached = syncStore.lastKnownProgress() ?: return
            val decision = HeartsEconomy.gate(cached.hearts, cached.heartsRefillAt?.toLong(), now())
            _state.update { it.copy(outOfHearts = (decision as? HeartsEconomy.GateDecision.OutOfHearts)?.let { d -> OutOfHeartsModel(d.refillAt) }) }
            return
        }
        try {
            sessionToken = client.startLessonSession(_state.value.lesson.id, course.code)
            _state.update { it.copy(outOfHearts = null, buyMessage = null) }
        } catch (e: ProgressSyncError.OutOfHearts) {
            _state.update { it.copy(outOfHearts = OutOfHeartsModel(e.refillAt)) }
        } catch (e: Exception) {
            // Best effort: finish() starts a session when none is held.
        }
    }

    /** "Use 50 XP for a heart": the same buy_heart_with_xp RPC as web and iOS, then the gate is asked again. */
    fun buyHeart() {
        if (_state.value.buyingHeart) return
        _state.update { it.copy(buyingHeart = true, buyMessage = null) }
        viewModelScope.launch {
            val result = runCatching { client.buyHeartWithXp(course.code) }.getOrNull()
            if (result is BuyHeartResult.Ok) {
                syncStore.lastKnownProgress()?.let { syncStore.updateLastKnownProgress(it.copy(hearts = result.hearts, heartsRefillAt = null)) }
                openSessionNow()
                _state.update { it.copy(buyingHeart = false) }
            } else {
                val message = result?.let(BuyHeartResult::failureMessage) ?: "Couldn't reach the server. Check your connection and try again."
                _state.update { it.copy(buyingHeart = false, buyMessage = message) }
            }
        }
    }

    /** The countdown reached zero: ask the gate again (the server resolves a due refill first). */
    fun onRefillDue() = openSession()

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
        openSession()
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
            syncStore.lastKnownProgress()?.takeIf { it.hearts > 0 }?.let {
                val after = HeartsEconomy.afterLosingHeart(it.hearts, it.heartsRefillAt?.toLong(), now())
                syncStore.updateLastKnownProgress(it.copy(hearts = after.hearts, heartsRefillAt = after.heartsRefillAt?.toDouble()))
            }
            runCatching { client.loseHeart() }
        }
    }

    private suspend fun finish() {
        val s = _state.value
        _state.update { it.copy(isSubmitting = true) }
        try {
            if (!isConnected()) { queueOffline(); return }
            val held = sessionToken
            val result = if (held == null) {
                client.completeLesson(s.lesson.id, s.total, s.answers, course.code, client.startLessonSession(s.lesson.id, course.code))
            } else {
                try {
                    client.completeLesson(s.lesson.id, s.total, s.answers, course.code, held)
                } catch (e: ProgressSyncError.Server) {
                    // A token held since the lesson opened expires after 3 hours: mint a fresh one once.
                    if (e.status != 403) throw e
                    client.completeLesson(s.lesson.id, s.total, s.answers, course.code, client.startLessonSession(s.lesson.id, course.code))
                }
            }
            sessionToken = null
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
