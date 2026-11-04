package com.obsidianmedia.learnwithalphonso.core.podcast

/**
 * The podcast quiz: after an episode, a short quiz about it, paid as listening practice. Port of PodcastQuiz.swift.
 *
 * Every rule that decides a score or XP lives on the server (public.submit_podcast_quiz, reached through the
 * complete-podcast-quiz Edge Function). This file holds what the app needs around it: the run the learner steps through
 * and the copy. The client never sends a score, and the score it shows is the server's.
 */
data class PodcastQuizQuestion(
    val id: String,
    val prompt: String,
    val choices: List<String>,
    /** Used only to show the learner which answer was right; it never affects what is paid. */
    val answerIndex: Int,
)

data class PodcastQuizBest(val correct: Int, val xp: Int)

data class PodcastQuizOffer(val questions: List<PodcastQuizQuestion>, val best: PodcastQuizBest?)

data class PodcastQuizAnswer(val questionId: String, val choiceIndex: Int)

/** What the server decided. The only score the app ever shows. */
data class PodcastQuizResult(
    val correct: Int,
    val total: Int,
    val xpGain: Int,
    val streak: Int,
    val bestCorrect: Int,
    val bestXp: Int,
    val missedQuestionIds: List<String>,
)

enum class PodcastQuizError(val isRetryable: Boolean) {
    /** The hourly ceiling shared with lessons (HTTP 429). */
    RATE_LIMITED(true),

    /** The episode has no quiz, or the learner cannot see the episode. */
    NOT_FOUND(false),

    /** The answers were not exactly one per question. */
    INVALID_ANSWERS(false),
    UNAUTHORIZED(false),
    OFFLINE(true),
    SERVER(true),
}

/** The learner's pass through one quiz. Immutable with no I/O, so every rule is testable without a screen. */
sealed interface PodcastQuizPhase {
    data object Empty : PodcastQuizPhase
    data object Answering : PodcastQuizPhase
    data object Submitting : PodcastQuizPhase
    data class Error(val error: PodcastQuizError) : PodcastQuizPhase
    data object Done : PodcastQuizPhase
}

data class PodcastQuizRun(
    val questions: List<PodcastQuizQuestion>,
    val phase: PodcastQuizPhase = if (questions.isEmpty()) PodcastQuizPhase.Empty else PodcastQuizPhase.Answering,
    val index: Int = 0,
    val selected: Int? = null,
    val checked: Boolean = false,
    val answers: List<PodcastQuizAnswer> = emptyList(),
    val result: PodcastQuizResult? = null,
) {
    val current: PodcastQuizQuestion? get() = questions.getOrNull(index)
    val isLastQuestion: Boolean get() = index + 1 >= questions.size

    fun select(choice: Int): PodcastQuizRun {
        val question = current ?: return this
        if (phase != PodcastQuizPhase.Answering || checked || choice !in question.choices.indices) return this
        return copy(selected = choice)
    }

    fun check(): PodcastQuizRun =
        if (phase == PodcastQuizPhase.Answering && selected != null) copy(checked = true) else this

    fun next(): PodcastQuizRun {
        val picked = selected ?: return this
        val question = current ?: return this
        if (phase != PodcastQuizPhase.Answering || !checked) return this
        val recorded = answers + PodcastQuizAnswer(question.id, picked)
        return if (isLastQuestion) {
            copy(answers = recorded, selected = null, checked = false, phase = PodcastQuizPhase.Submitting)
        } else {
            copy(answers = recorded, selected = null, checked = false, index = index + 1)
        }
    }

    fun saved(result: PodcastQuizResult): PodcastQuizRun =
        if (phase == PodcastQuizPhase.Submitting) copy(result = result, phase = PodcastQuizPhase.Done) else this

    fun failed(error: PodcastQuizError): PodcastQuizRun =
        if (phase == PodcastQuizPhase.Submitting) copy(phase = PodcastQuizPhase.Error(error)) else this

    /** Resend the same answers after a failure. Only a retryable one can be retried. */
    fun retry(): PodcastQuizRun {
        val failure = phase as? PodcastQuizPhase.Error ?: return this
        return if (failure.error.isRetryable) copy(phase = PodcastQuizPhase.Submitting) else this
    }
}

object PodcastQuizCopy {
    const val OFFER_TITLE = "Test what you heard"
    const val TAKE_THE_QUIZ = "Take the quiz"
    const val CORRECT_LABEL = "Correct answer"
    const val WRONG_LABEL = "Your answer, not correct"

    fun offerDetail(questionCount: Int, best: PodcastQuizBest?): String {
        var line = "$questionCount questions · 10 XP for each correct answer"
        if (best != null) line += " · your best: ${best.correct} of $questionCount"
        return line
    }

    fun message(error: PodcastQuizError): String = when (error) {
        PodcastQuizError.RATE_LIMITED -> "Slow down a little and try again."
        PodcastQuizError.OFFLINE -> "We couldn't save your answers. Check your connection and try again."
        PodcastQuizError.NOT_FOUND -> "This quiz isn't available right now."
        PodcastQuizError.UNAUTHORIZED -> "Please sign in again to save your answers."
        PodcastQuizError.INVALID_ANSWERS -> "Something went wrong with your answers. Leave the quiz and open it again."
        PodcastQuizError.SERVER -> "We couldn't save your answers. Please try again."
    }

    fun xpLine(result: PodcastQuizResult): String =
        if (result.xpGain > 0) "+${result.xpGain} XP" else "No new XP this time. Your best is ${result.bestCorrect} of ${result.total}."
}

/** A quiz that could not be read or sent. Never carries a score. */
class PodcastQuizException(val error: PodcastQuizError) : Exception(error.name)
