package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.WeeklyQuest

/**
 * The weekly_quests catalogue (supabase/migrations/20260920060000_v3_engagement_mechanics.sql), mirrored for display like
 * web's src/data/quests.ts and iOS's WeeklyQuests.swift. The database copy is the truth `claim_weekly_quest` checks.
 *
 * These ids are NOT weekly challenge template ids (`lessons_5`...): the challenge system (get_weekly_challenges) awards
 * itself on read and has no claim. Sending a challenge id to claim_weekly_quest answers `unknown-quest`.
 */
data class WeeklyQuestDef(val id: String, val title: String, val metric: Metric, val target: Int, val xpReward: Int) {
    enum class Metric { XP_EARNED, LESSONS_COMPLETED }
}

val WEEKLY_QUEST_DEFS: List<WeeklyQuestDef> = listOf(
    WeeklyQuestDef("weekly_xp_150", "Weekly Grinder", WeeklyQuestDef.Metric.XP_EARNED, 150, 30),
    WeeklyQuestDef("weekly_xp_500", "XP Marathon", WeeklyQuestDef.Metric.XP_EARNED, 500, 100),
    WeeklyQuestDef("weekly_lessons_5", "Lesson Streak", WeeklyQuestDef.Metric.LESSONS_COMPLETED, 5, 40),
)

/** True for an id `claim_weekly_quest` knows; a challenge template id is not one. */
fun isWeeklyQuestId(id: String): Boolean = WEEKLY_QUEST_DEFS.any { it.id == id }

/** This week's quests from the week's XP and lesson count (progress is computed from durable data, as on web). */
fun buildWeeklyQuests(xpThisWeek: Int, lessonsThisWeek: Int, claimedIds: Set<String>): List<WeeklyQuest> =
    WEEKLY_QUEST_DEFS.map { d ->
        WeeklyQuest(
            id = d.id,
            title = d.title,
            xpReward = d.xpReward,
            progress = if (d.metric == WeeklyQuestDef.Metric.XP_EARNED) xpThisWeek else lessonsThisWeek,
            target = d.target,
            claimed = d.id in claimedIds,
        )
    }

/** What a refusal from claim_weekly_quest means to the learner; anything unknown gets the generic line. */
fun weeklyQuestClaimMessage(reason: String?): String = when (reason) {
    "not-yet-completed" -> "Not finished yet. Keep going!"
    "already-claimed" -> "You already claimed this one."
    "invalid-week" -> "This week just ended. Pull to refresh for the new quests."
    "no-course-progress" -> "Complete a lesson in this course first."
    else -> "Couldn't claim that reward. Try again."
}
