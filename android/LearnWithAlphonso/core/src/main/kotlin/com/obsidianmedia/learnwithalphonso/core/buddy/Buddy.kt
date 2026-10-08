package com.obsidianmedia.learnwithalphonso.core.buddy

/**
 * Study buddies (study together, Phase 3a on the server; docs/superpowers/specs/2026-10-06-study-together-design.md).
 * The server is the source of truth for the week rules (`_resolve_buddy_pair`); [BuddyRules] mirrors them so the
 * clients stay honest, and [BuddyCopy] owns the wording, word-for-word src/lib/buddy.ts and the iOS Kit's
 * `BuddyCopy` (all pinned by the shared buddy.fixtures.json).
 */
object BuddyRules {
    /** Distinct lessons each buddy needs in a week. Equals `goal` in 20261006180000_buddy_pairing.sql. */
    const val GOAL = 3

    data class WeekResult(val outcome: String, val streakWeeks: Int, val graceAvailable: Boolean)

    /** One week of the pair's streak. The week the pair was formed can only help. */
    fun resolveWeek(streakWeeks: Int, graceAvailable: Boolean, a: Int, b: Int, isFirstWeek: Boolean): WeekResult = when {
        a >= GOAL && b >= GOAL -> WeekResult("hit", streakWeeks + 1, true)
        isFirstWeek -> WeekResult("first_week", streakWeeks, graceAvailable)
        graceAvailable -> WeekResult("grace", streakWeeks, false)
        else -> WeekResult("miss", 0, false)
    }
}

object BuddyCopy {
    const val INTRO = "Pick a friend to study with. Each week you both aim for 3 lessons and keep a streak together."
    const val LOAD_FAILED = "Couldn't load your study buddy."

    private val messages = mapOf(
        "requested" to "Request sent. They'll see it on their Friends page.",
        "paired" to "You're study buddies now.",
        "declined" to "Request declined.",
        "cancelled" to "Request cancelled.",
        "ended" to "You're no longer study buddies.",
        "not_friends" to "You can only ask a friend to be your study buddy.",
        "blocked" to "You can't be study buddies with this person.",
        "already_paired" to "You already have a study buddy.",
        "friend_paired" to "Your friend already has a study buddy.",
        "already_requested" to "You've already asked them.",
        "not_found" to "That request is no longer open.",
        "not_paired" to "You don't have a study buddy.",
        "unauthenticated" to "Sign in to find a study buddy.",
        "sent" to "Sent.",
        "rate_limited" to "You've sent a lot of messages. Try again in a while.",
        "bad_preset" to "Something went wrong. Try again.",
        "waiting" to "You're on the list. We'll pair you with a learner at your level.",
        "left" to "You've stopped looking for a study buddy.",
        "not_waiting" to "You weren't looking for a study buddy.",
        "matching_off" to "Finding a study buddy isn't available right now.",
        "not_studying" to "Start that course first, then look for a study buddy.",
        "age_required" to "Please confirm you're 13 or older to be matched with another learner.",
        "too_many_tries" to "You've tried a lot just now. Try again in an hour.",
        "match_limit" to "You've been matched with a few learners this week. Try again in a few days.",
        "matching_paused" to "Messages with matched learners are paused right now. Your progress is kept.",
        "unknown" to "Something went wrong. Try again.",
    )

    /** Fixed wording for a server status; a status this client does not know gets the generic message. */
    fun statusMessage(status: String): String = messages[status] ?: messages.getValue("unknown")

    /** "You 2/3 · Buddy 3/3 this week"; counts above the goal show as the goal. */
    fun weekLine(myCount: Int, buddyCount: Int, goal: Int): String =
        "You ${minOf(myCount, goal)}/$goal · Buddy ${minOf(buddyCount, goal)}/$goal this week"

    fun streakLine(weeks: Int): String = "Streak: $weeks week${if (weeks == 1) "" else "s"}"
    fun graceLine(available: Boolean): String = if (available) "1 grace week left" else "No grace week left"
    fun incomingLine(name: String): String = "$name wants to be your study buddy."
    fun outgoingLine(name: String): String = "Waiting for $name."
    fun endConfirm(name: String): String = "End being study buddies with $name? Your streak ends."

    // Opt-in matching (Phase 3b).
    const val POOL_INTRO = "Or let us find one: we'll pair you with another learner of the same course at a similar level. You'll see each other's name and weekly progress, and can only send the preset messages. You can end it, block or report at any time."
    const val STOP_LOOKING = "Stop looking"
    const val MATCHED_LABEL = "Matched learner"
    const val AGE_CONFIRM = "I'm 13 or older"
    private val courseNames = mapOf("en" to "English", "fr" to "French", "es" to "Spanish")

    /** "French" for "fr"; an unknown code is shown as-is. */
    fun courseName(course: String): String = courseNames[course] ?: course
    fun findButton(course: String): String = "Find me a study buddy (${courseName(course)})"
    fun waitingLine(course: String): String = "Looking for a study buddy learning ${courseName(course)} at your level."

    /** Most preset messages one buddy may send per hour (the server's limit). */
    const val MESSAGES_PER_HOUR = 20

    data class Preset(val id: String, val text: String)

    /** The only things buddies can say to each other: fixed encouragements, never free text (owner decision 2026-10-06). */
    val PRESETS = listOf(
        Preset("lets_study", "Let's study together!"),
        Preset("nice_work", "Nice work!"),
        Preset("keep_going", "Keep going, you've got this!"),
        Preset("need_a_hand", "Need a hand?"),
        Preset("on_my_way", "On my way to a lesson!"),
        Preset("good_morning", "Good morning!"),
        Preset("good_night", "Good night!"),
        Preset("proud_of_you", "Proud of you!"),
    )

    /** The preset's text, or null for an id this client does not know (the history skips that message). */
    fun presetText(id: String): String? = PRESETS.firstOrNull { it.id == id }?.text

    /** "You: Nice work!" / "Bo: Nice work!", or null for an unknown preset. */
    fun messageLine(isMine: Boolean, buddyName: String, presetId: String): String? =
        presetText(presetId)?.let { "${if (isMine) "You" else buddyName}: $it" }
}

/** One `get_buddy_messages` row. */
data class BuddyMessage(val messageId: String, val senderId: String, val isMine: Boolean, val presetId: String, val sentAt: String)

/** One `get_my_buddy` row: the caller's active buddy and this week's counts. */
data class MyBuddy(
    val pairId: String,
    val buddyId: String,
    val buddyName: String,
    val buddyAvatarSeed: String,
    val pairedAt: String,
    val weekStart: String,
    val myCount: Int,
    val buddyCount: Int,
    val goal: Int,
    val streakWeeks: Int,
    val graceAvailable: Boolean,
    val lastOutcome: String?,
    /** Paired through opt-in matching (not a friend): the section offers block and report. */
    val isMatch: Boolean = false,
)

/** The `get_buddy_pool` row: whether matching is switched on, whether the caller is waiting, and their courses. */
data class BuddyPool(val matchingEnabled: Boolean, val waiting: Boolean, val course: String?, val courses: List<String>)

/** One pending request from `get_buddy_requests`. */
data class BuddyRequest(
    val requestId: String,
    val direction: Direction,
    val otherId: String,
    val otherName: String,
    val otherAvatarSeed: String,
    val requestedAt: String,
) {
    enum class Direction { INCOMING, OUTGOING }
}
