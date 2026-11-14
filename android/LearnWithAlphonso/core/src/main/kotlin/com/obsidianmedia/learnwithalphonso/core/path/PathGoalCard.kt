package com.obsidianmedia.learnwithalphonso.core.path

import com.obsidianmedia.learnwithalphonso.core.goal.GoalCopy

/**
 * The goal card at the top of MY PATH: the target level and date, the lessons a week it takes and whether the learner
 * is on track, or an invitation to set a goal. No plan maths: every number and the status words come from
 * /api/learning-path (the goal planner's own output). Word for word the same as the web card
 * (src/lib/path-goal-card.ts) and iOS (PathGoalCard.swift): change all three together.
 */
data class PathGoalCardLines(
    /** True when a goal is set; the card then opens the planner to change it, otherwise to set one. */
    val hasGoal: Boolean,
    val kicker: String,
    val headline: String,
    val detail: String,
)

object PathGoalCard {
    const val KICKER = "My goal"
    const val UNSET_HEADLINE = "Set a goal"
    const val UNSET_DETAIL = "Pick a level and a date and we work out the lessons a week."

    /** The card for a path, or the invitation when there is none yet (no goal set). */
    fun lines(path: LearningPath?): PathGoalCardLines {
        if (path == null) return PathGoalCardLines(false, KICKER, UNSET_HEADLINE, UNSET_DETAIL)
        val progress = path.progress
        // The server reports 0 a week once the goal is reached or its date has passed: a number would mean nothing.
        val perWeek = if (progress.requiredPerWeek > 0) {
            "${progress.requiredPerWeek} ${if (progress.requiredPerWeek == 1) "lesson" else "lessons"} a week"
        } else null
        return PathGoalCardLines(
            hasGoal = true,
            kicker = KICKER,
            headline = "${progress.targetLevel} by ${GoalCopy.formatDate(progress.targetDate)}",
            detail = if (perWeek != null) "$perWeek · ${path.statusLine}" else path.statusLine,
        )
    }
}
