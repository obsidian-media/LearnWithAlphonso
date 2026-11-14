package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.firstrun.FirstRun
import com.obsidianmedia.learnwithalphonso.core.goal.GoalCopy

// The state mapping behind the redesigned social screens (Duels, Friends, League, Teams) and Build my path. The views
// only lay these results out; the choices of what to say and which tone to use live here so they are tested. Word for
// word the same as iOS SocialPresentation.swift: change both together.

/** What learners read for each league tier. The keys are the database's league_tier values and never change. */
object LeagueTierCopy {
    val labels: Map<String, String> = mapOf("bronze" to "Sprout", "silver" to "Sapling", "sapphire" to "Grove", "ruby" to "Treetop", "diamond" to "Summit")

    /** The display name for a tier key; an unknown key (never sent by the server) shows capitalised as-is. */
    fun label(tier: String): String = labels[tier] ?: tier.replaceFirstChar { it.uppercase() }
}

enum class DsRankMedal { GOLD, SILVER, BRONZE }

/** What the Duels screen says about a list of duels. */
object DuelsPresentation {
    enum class ResultTone { WON, LOST, TIED, DECLINED }

    data class Result(val label: String, val tone: ResultTone)

    /** "1 pending · 1 active · 3 finished": only the parts that are not zero, null when every part is. */
    fun summary(pending: Int, active: Int, finished: Int): String? {
        val parts = listOfNotNull(
            if (pending > 0) "$pending pending" else null,
            if (active > 0) "$active active" else null,
            if (finished > 0) "$finished finished" else null,
        )
        return if (parts.isEmpty()) null else parts.joinToString(" · ")
    }

    /** The learner's share of the XP earned in a duel so far, 0 to 1; an even split (0.5) when neither has earned any. */
    fun share(mine: Int, theirs: Int): Float {
        val m = maxOf(0, mine)
        val t = maxOf(0, theirs)
        if (m + t == 0) return 0.5f
        return m.toFloat() / (m + t).toFloat()
    }

    /** A finished duel's result for this learner: "Declined", "You won", "You lost" or "Tied". */
    fun result(status: String, winnerId: String?, myId: String?): Result {
        if (status == "declined") return Result("Declined", ResultTone.DECLINED)
        if (winnerId != null) return if (winnerId == myId) Result("You won", ResultTone.WON) else Result("You lost", ResultTone.LOST)
        return Result("Tied", ResultTone.TIED)
    }
}

/** What the League screen shows above the board. */
object LeaguePresentation {
    /** The top three ranks get a medal; every other rank is a plain number. */
    fun medal(rank: Int): DsRankMedal? = when (rank) {
        1 -> DsRankMedal.GOLD
        2 -> DsRankMedal.SILVER
        3 -> DsRankMedal.BRONZE
        else -> null
    }

    /** "Treetop league": the learner's tier by display name; null when no tier is known yet, so no league line is made up. */
    fun tierTitle(tier: String?): String? = if (tier.isNullOrEmpty()) null else "${LeagueTierCopy.label(tier)} league"
}

/** The Teams screen's small decisions. */
object TeamsPresentation {
    /** The line under the title before the learner is on a team (new copy, approved with the Teams mock). */
    const val SUBTITLE = "Study with a group and share a weekly mission."

    /** Join by code is possible once something is typed (blank space is not a code). */
    fun canJoin(code: String): Boolean = code.isNotBlank()

    /** Create team is possible once the name has a letter in it. */
    fun canCreate(name: String): Boolean = name.isNotBlank()
}

/** The goal chips on Build my path (Round 8 A0): why the learner is here, the level and the date, from their own data. */
object PathGoalChips {
    const val NOTE = "Pre-filled from first run and your level. Tap to change."

    /** "Travel", "Finish B1", "by 10 May 2027": the first-run purpose only when it is a known one. */
    fun labels(purposeId: String?, targetLevel: String, targetDate: String): List<String> {
        val out = mutableListOf<String>()
        FirstRun.goalChoices.firstOrNull { it.id == purposeId }?.let { out += it.label }
        out += "Finish $targetLevel"
        out += "by ${GoalCopy.formatDate(targetDate)}"
        return out
    }
}

/** What the Review screen shows and says: which of its five states, the due label, the bar and the verdict wording. */
object ReviewPresentation {
    const val ERROR_TITLE = "Couldn't load your review queue"
    const val EMPTY_TITLE = "All caught up"
    const val EMPTY_BODY = "Nothing due for review right now."
    const val CLEARED_TITLE = "Queue cleared"
    const val CLEARED_BODY = "Nice work. Check back tomorrow for more."

    enum class Screen { LOADING, ERROR, EMPTY, CLEARED, QUESTION }

    /** Loading wins, then a failure, then an empty queue ("All caught up"), then a finished one ("Queue cleared"). */
    fun screen(isLoading: Boolean, hasError: Boolean, queueSize: Int, isDone: Boolean): Screen = when {
        isLoading -> Screen.LOADING
        hasError -> Screen.ERROR
        queueSize == 0 -> Screen.EMPTY
        isDone -> Screen.CLEARED
        else -> Screen.QUESTION
    }

    /** "1/2 due": the place in the queue, counted from one. */
    fun dueLabel(index: Int, total: Int): String = "${index + 1}/$total due"

    /** The bar fills with the answered items; the one on screen counts once it has been checked. */
    fun progress(index: Int, total: Int, checked: Boolean): Float = (index + if (checked) 1 else 0).toFloat() / maxOf(1, total).toFloat()

    /** Same wording as the web's review: the item either stays learned or comes back. */
    fun verdictTitle(correct: Boolean): String = if (correct) "Still got it." else "Back in the queue."
}

/** The Friends screen's counts: the line under the title and the header over the list. */
object FriendsPresentation {
    /** "3 friends" / "1 friend"; null with no friends, so the title carries no made-up line. */
    fun countLine(count: Int): String? = if (count <= 0) null else "$count friend${if (count == 1) "" else "s"}"

    /** The list's header: "3 friends", or "Your friends" while there are none. */
    fun friendsHeader(count: Int): String = countLine(count) ?: "Your friends"
}

/** The Season screen's wording (batch 2, screen 19): the same lines the web and iOS show. */
object SeasonPresentation {
    /** New copy, approved with the Season mock: the line beside the spinner. */
    const val LOADING = "Loading your season\u2026"
    const val FAILED_TITLE = "Couldn't load your season status."
    const val FAILED_BODY = "Check your connection and try again."

    fun rankLine(rank: Int, cohortSize: Int): String = "Rank $rank of $cohortSize this week"

    fun lastWeekLine(division: Int, rank: Int, cohortSize: Int): String = "Division $division, rank $rank of $cohortSize"
}

/** The Weekly recap sheet's small decisions (batch 2, screen 25). */
object RecapPresentation {
    /** A week with no XP is a quiet one: Alphonso is asleep instead of cheering. */
    fun isQuiet(lastWeekXp: Int): Boolean = lastWeekXp <= 0

    /** "You moved up to Sapling!": the new league by its display name. */
    fun promotionLine(tier: String): String = "You moved up to ${LeagueTierCopy.label(tier)}!"
}
