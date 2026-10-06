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

    init { reload() }

    fun reload() { viewModelScope.launch { model.load(course.code) } }

    fun remove() { viewModelScope.launch { model.remove(course.code) } }

    suspend fun preview(level: String, day: String): PreviewResult = model.preview(course.code, level, day)

    suspend fun save(level: String, day: String): SaveResult = model.save(course.code, level, day)
}
