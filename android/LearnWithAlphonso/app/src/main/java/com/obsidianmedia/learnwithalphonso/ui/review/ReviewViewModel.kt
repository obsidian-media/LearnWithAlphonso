package com.obsidianmedia.learnwithalphonso.ui.review

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.logic.ReviewGradeInput
import com.obsidianmedia.learnwithalphonso.core.logic.ReviewOutcome
import com.obsidianmedia.learnwithalphonso.core.logic.TranslationAnswer
import com.obsidianmedia.learnwithalphonso.core.logic.computeReviewOutcome
import com.obsidianmedia.learnwithalphonso.core.logic.isAnswerCorrect
import com.obsidianmedia.learnwithalphonso.core.logic.questionFromWeaknessItem
import com.obsidianmedia.learnwithalphonso.core.logic.utcDateString
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.core.net.TranslationVerdict
import com.obsidianmedia.learnwithalphonso.core.sync.PendingReviewGrade
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneOffset

data class ReviewUiState(
    val isLoading: Boolean = true,
    val queue: List<ReviewItem> = emptyList(),
    val idx: Int = 0,
    val picked: String? = null,
    val checked: Boolean = false,
    val isChecking: Boolean = false,
    val isSubmitting: Boolean = false,
    val translationVerdict: TranslationVerdict? = null,
    val alreadySubmitted: Boolean = false,
    val errorMessage: String? = null,
    val clearedBonusMessage: String? = null,
    val showingCachedSince: Long? = null,
    val cachedWithoutTimestamp: Boolean = false,
) {
    val currentItem: ReviewItem? get() = queue.getOrNull(idx)
    val isDone: Boolean get() = !isLoading && queue.isNotEmpty() && idx >= queue.size
}

/** Port of ReviewQueueView.swift: online grading through grade-review, offline grading queued with a local SM-2 guess. */
class ReviewViewModel(
    private val content: ContentStore,
    private val client: ProgressSyncClient,
    private val syncStore: SyncQueueStore,
    private val isConnected: () -> Boolean,
    private val course: Course,
    private val now: () -> Long = System::currentTimeMillis,
    /** Plan 4: the due-review nudge reuses this fetch (no second round trip), as ReviewQueueView.swift does. */
    private val onQueueFetched: (List<ReviewItem>) -> Unit = {},
) : ViewModel() {
    private val _state = MutableStateFlow(ReviewUiState())
    val state: StateFlow<ReviewUiState> = _state.asStateFlow()

    init { viewModelScope.launch { loadQueue() } }

    fun questionFor(item: ReviewItem): Question? {
        if (item.source == "weakness") return questionFromWeaknessItem(item)
        val found = content.findLesson(item.lessonId, course) ?: return null
        val questionId = item.itemKey.substringAfterLast(':')
        return found.second.questions.firstOrNull { it.id == questionId }
    }

    fun pick(value: String?) = _state.update { if (it.checked) it else it.copy(picked = value) }

    fun isCurrentCorrect(): Boolean {
        val s = _state.value
        val q = s.currentItem?.let(::questionFor) ?: return false
        return s.translationVerdict?.correct ?: isAnswerCorrect(q, s.picked, course)
    }

    fun check() {
        val s = _state.value
        val item = s.currentItem ?: return
        val q = questionFor(item) ?: return
        if (s.checked || s.picked.isNullOrBlank()) return
        if (q is Question.Translate) {
            _state.update { it.copy(isChecking = true) }
            viewModelScope.launch {
                val (verdict, submitted) = gradeTranslationItem(item, q, s.picked)
                _state.update { it.copy(isChecking = false, checked = true, translationVerdict = verdict, alreadySubmitted = submitted) }
            }
        } else {
            _state.update { it.copy(checked = true) }
        }
    }

    fun next() {
        val s = _state.value
        val item = s.currentItem ?: return
        val q = questionFor(item) ?: run { advance(); return }
        val picked = s.picked ?: return
        viewModelScope.launch {
            _state.update { it.copy(isSubmitting = true) }
            try {
                if (s.alreadySubmitted) {
                    advance()
                    claimBonusIfCleared()
                    return@launch
                }
                if (isConnected()) {
                    val ok = runCatching { client.gradeReview(item.itemKey, picked, course.code) }.isSuccess
                    if (ok) {
                        advance()
                        claimBonusIfCleared()
                        return@launch
                    }
                }
                queueGradeOffline(item, q, picked)
                advance()
            } finally {
                _state.update { it.copy(isSubmitting = false) }
            }
        }
    }

    /** Skips an item whose question no longer exists in the bundle rather than crashing. */
    fun skipUnresolvable() = advance()

    suspend fun loadQueue() {
        _state.value = ReviewUiState()
        if (isConnected()) {
            val fetched = runCatching { client.fetchDueReviews(course.code) }.getOrNull()
            if (fetched != null) {
                syncStore.replaceLastKnownDueReviews(fetched.due)
                onQueueFetched(fetched.due)
                _state.update { it.copy(isLoading = false, queue = fetched.due) }
                return
            }
        }
        val cached = syncStore.lastKnownDueReviews()
        val since = syncStore.lastSyncedAt()
        _state.update { it.copy(isLoading = false, queue = cached, showingCachedSince = since, cachedWithoutTimestamp = since == null) }
    }

    private suspend fun gradeTranslationItem(item: ReviewItem, q: Question.Translate, picked: String?): Pair<TranslationVerdict, Boolean> {
        val submission = (picked ?: "").trim()
        val local = TranslationVerdict(TranslationAnswer.matches(submission, q.acceptableAnswers), null)
        if (!isConnected()) return local to false
        val outcome = runCatching { client.gradeReview(item.itemKey, submission, course.code) }.getOrNull() ?: return local to false
        val correct = outcome.correct ?: return local to false
        return TranslationVerdict(correct, null) to true
    }

    private suspend fun queueGradeOffline(item: ReviewItem, q: Question, answer: String) {
        val today = utcDateString(now())
        val correct = isAnswerCorrect(q, answer, course)
        val input = ReviewGradeInput(correct, item.ease, item.intervalDays, item.repetitions, 0, item.intervalDays)
        val outcome = computeReviewOutcome(input, today) { days -> Instant.ofEpochMilli(now()).atZone(ZoneOffset.UTC).toLocalDate().plusDays(days.toLong()).toString() }
        syncStore.appendReviewGrade(PendingReviewGrade(item.itemKey, answer, course.code, now()))
        when (outcome) {
            is ReviewOutcome.Retired -> syncStore.removeCachedDueReview(item.itemKey)
            is ReviewOutcome.Rescheduled -> if (outcome.dueOn > today) syncStore.removeCachedDueReview(item.itemKey)
        }
    }

    private fun advance() = _state.update { it.copy(idx = it.idx + 1, picked = null, checked = false, translationVerdict = null, alreadySubmitted = false) }

    private suspend fun claimBonusIfCleared() {
        val s = _state.value
        if (s.idx < s.queue.size || !isConnected()) return
        val bonus = runCatching { client.claimReviewClearBonus(course.code) }.getOrNull() ?: return
        if (bonus.granted) _state.update { it.copy(clearedBonusMessage = "Review queue cleared: +1 heart!") }
    }
}
