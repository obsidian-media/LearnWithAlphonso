package com.obsidianmedia.learnwithalphonso.core.goal

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** What the card needs from the server; [com.obsidianmedia.learnwithalphonso.core.net.LearningGoalClient] implements it. */
interface GoalApi {
    suspend fun fetch(course: String): LearningGoalState
    suspend fun preview(course: String, targetLevel: String, targetDate: String): GoalPlan
    suspend fun save(course: String, targetLevel: String, targetDate: String): LearningGoalState
    suspend fun remove(course: String)
}

enum class GoalPhase { LOADING, EMPTY, GOAL, FAILED }

data class GoalCardState(
    val phase: GoalPhase = GoalPhase.LOADING,
    val goal: StoredGoal? = null,
    val plan: GoalPlan? = null,
    val loadError: LearningGoalError? = null,
    /** A failed save or remove, shown inline next to the goal that is still on screen. */
    val actionError: String? = null,
) {
    /** True while a CACHED plan is shown because the network is down; editing is disabled then. */
    val offline: Boolean get() = phase == GoalPhase.GOAL && loadError == LearningGoalError.Offline
}

sealed interface PreviewResult {
    data class Ok(val plan: GoalPlan) : PreviewResult
    data class Failed(val message: String) : PreviewResult
}

sealed interface SaveResult {
    object Saved : SaveResult
    data class Failed(val message: String) : SaveResult

    /** The learner left the course (or a newer request started) before this finished; nothing on screen changed. */
    object Dropped : SaveResult
}

/**
 * The whole state machine of the goal card, free of Android so it is unit-tested on the JVM. The one subtle rule is
 * the generation counter: every load, save and remove takes a number, and when it finishes it only touches the
 * screen if it is still the latest. That is what stops a slow answer for the course the learner just left from
 * overwriting the new course's card (the iOS review found that guard impossible to test in SwiftUI; here it is
 * tested). Cache writes and clears are NOT dropped: they belong to the request's own course and user.
 */
class GoalCardModel(
    private val api: GoalApi,
    private val cache: GoalCache,
    private val userId: () -> String?,
) {
    private val _state = MutableStateFlow(GoalCardState())
    val state: StateFlow<GoalCardState> = _state.asStateFlow()
    private var generation = 0

    /**
     * [quiet] reloads while the card that is already showing stays on screen (no "Loading" flash): used when the
     * learner comes back to the screen, so the numbers are fresh without flicker. If nothing is showing yet the
     * card is already the default "loading" one, so it looks like a normal load. A quiet reload that fails is shown as a failure, never hidden.
     */
    suspend fun load(course: String, quiet: Boolean = false) {
        val mine = ++generation
        if (!quiet) _state.value = GoalCardState()
        val uid = userId()
        if (uid.isNullOrBlank()) {
            _state.value = GoalCardState(phase = GoalPhase.FAILED, loadError = LearningGoalError.NotSignedIn)
            return
        }
        try {
            val next = api.fetch(course)
            cache.write(next, uid, course)
            if (mine != generation) return
            _state.value = GoalCardState(
                phase = if (next.goal == null) GoalPhase.EMPTY else GoalPhase.GOAL,
                goal = next.goal,
                plan = next.plan,
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (mine != generation) return
            val failure = e as? LearningGoalError ?: LearningGoalError.Unavailable
            // The cached plan is only for being OFFLINE. A 401 or a server error never shows it.
            val cached = if (failure == LearningGoalError.Offline) cache.read(uid, course) else null
            _state.value = if (cached != null) {
                GoalCardState(GoalPhase.GOAL, cached.goal, cached.plan, loadError = failure)
            } else {
                GoalCardState(GoalPhase.FAILED, loadError = failure)
            }
        }
    }

    suspend fun remove(course: String) {
        val mine = ++generation
        val uid = userId()
        if (uid.isNullOrBlank()) {
            _state.value = _state.value.copy(actionError = GoalCopy.actionFailureMessage(LearningGoalError.NotSignedIn))
            return
        }
        try {
            api.remove(course)
            cache.clear(uid, course)
            if (mine != generation) return
            _state.value = GoalCardState(phase = GoalPhase.EMPTY)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (mine != generation) return
            // A failed remove is an action error, not "offline": the goal is still there and editable.
            _state.value = _state.value.copy(actionError = GoalCopy.actionFailureMessage(e as? LearningGoalError ?: LearningGoalError.Unavailable))
        }
    }

    suspend fun save(course: String, targetLevel: String, targetDate: String): SaveResult {
        val mine = ++generation
        val uid = userId()
        if (uid.isNullOrBlank()) return SaveResult.Failed(GoalCopy.actionFailureMessage(LearningGoalError.NotSignedIn))
        return try {
            val saved = api.save(course, targetLevel, targetDate)
            cache.write(saved, uid, course)
            if (mine != generation) return SaveResult.Dropped
            _state.value = GoalCardState(
                phase = if (saved.goal == null) GoalPhase.EMPTY else GoalPhase.GOAL,
                goal = saved.goal,
                plan = saved.plan,
            )
            SaveResult.Saved
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (mine != generation) SaveResult.Dropped
            else SaveResult.Failed(GoalCopy.actionFailureMessage(e as? LearningGoalError ?: LearningGoalError.Unavailable))
        }
    }

    /** The plan for a candidate goal. Never touches the card's state and never invalidates a request in flight. */
    suspend fun preview(course: String, targetLevel: String, targetDate: String): PreviewResult =
        try {
            PreviewResult.Ok(api.preview(course, targetLevel, targetDate))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            PreviewResult.Failed(GoalCopy.actionFailureMessage(e as? LearningGoalError ?: LearningGoalError.Unavailable))
        }
}
