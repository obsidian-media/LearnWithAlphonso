package com.obsidianmedia.learnwithalphonso.ui.learn

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.goal.GoalApi
import com.obsidianmedia.learnwithalphonso.core.goal.GoalCache
import com.obsidianmedia.learnwithalphonso.core.goal.GoalCardModel
import com.obsidianmedia.learnwithalphonso.core.goal.GoalCardState
import com.obsidianmedia.learnwithalphonso.core.goal.PreviewResult
import com.obsidianmedia.learnwithalphonso.core.goal.SaveResult
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Thin wrapper over [GoalCardModel] (all the logic, including the stale-request guard, lives and is tested in :core).
 * One instance per course (the Learn screen keys it by course code), so a request still running for a course the
 * learner left can only ever write into that course's own, hidden, model.
 */
class GoalCardViewModel(
    private val course: Course,
    api: GoalApi,
    cache: GoalCache,
    userId: () -> String?,
) : ViewModel() {
    private val model = GoalCardModel(api, cache, userId)
    val state: StateFlow<GoalCardState> = model.state

    /**
     * Loads the goal. [quiet] keeps the card that is already showing while it refreshes: the Learn screen asks for it on
     * every re-entry, because this view-model outlives the screen (it is kept with the Learn tab's back-stack entry).
     */
    fun reload(quiet: Boolean = false) { viewModelScope.launch { model.load(course.code, quiet) } }

    fun remove() { viewModelScope.launch { model.remove(course.code) } }

    suspend fun preview(level: String, day: String): PreviewResult = model.preview(course.code, level, day)

    /**
     * Runs in the view-model's scope, not the caller's: if the learner leaves the screen mid-save the request still
     * finishes and the card shows the saved goal on return (cancelling the caller only stops waiting for the result).
     */
    suspend fun save(level: String, day: String): SaveResult =
        viewModelScope.async { model.save(course.code, level, day) }.await()
}
