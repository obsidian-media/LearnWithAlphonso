package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.WeeklyChallenge
import com.obsidianmedia.learnwithalphonso.core.team.TeamMission
import com.obsidianmedia.learnwithalphonso.core.team.TeamMissionStatus

/**
 * The words on the small cards of Learn's "For you" rail (the web's ForYouRail.tsx and iOS's LessonBrowserView
 * forYouItems say the same). The rail holds Review, the goal path, the team mission and this week's challenges; each
 * card shows one short value and opens what it always opened.
 */
object LearnRail {
    const val REVIEW_CAUGHT_UP = "All caught up"
    const val PATH_UNSET = "Set a goal"
    const val TEAM_NEEDS_MEMBERS = "Invite a friend"
    const val TEAM_COMPLETE = "Complete"

    fun reviewValue(due: Int): String = if (due > 0) "$due due" else REVIEW_CAUGHT_UP

    /** What the screen reader says for the Review card: the title and the same wording the old Review row used. */
    fun reviewSpoken(due: Int): String = "Review, " + when (due) {
        0 -> "Nothing due right now"
        1 -> "1 item ready to review"
        else -> "$due items ready to review"
    }

    fun teamValue(mission: TeamMission): String = when (mission.status) {
        TeamMissionStatus.NEEDS_MEMBERS -> TEAM_NEEDS_MEMBERS
        TeamMissionStatus.COMPLETE -> TEAM_COMPLETE
        TeamMissionStatus.IN_PROGRESS -> "${mission.percent}% done"
    }

    /** With no challenges this week the card still opens for the quests, so it counts those instead. */
    fun weeklyValue(challenges: List<WeeklyChallenge>, questCount: Int = 0, failed: Boolean = false): String = when {
        failed && challenges.isEmpty() && questCount == 0 -> "Couldn't load"
        challenges.isEmpty() && questCount > 0 -> "$questCount quests"
        else -> "${challenges.count { it.completed }} of ${challenges.size} done"
    }
}
