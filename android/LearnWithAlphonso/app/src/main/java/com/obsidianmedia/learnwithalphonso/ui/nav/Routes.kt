package com.obsidianmedia.learnwithalphonso.ui.nav

import android.net.Uri

/** Navigation routes. Tabs are top-level; the rest push over them. */
object Routes {
    const val LEARN = "learn"
    const val LISTEN = "listen"
    const val PRACTICE = "practice"
    const val HECTOR = "hector"
    const val PROFILE = "profile"

    const val LESSON = "lesson/{course}/{lessonId}"
    fun lesson(course: String, lessonId: String) = "lesson/$course/$lessonId"

    const val REVIEW = "review/{course}"
    fun review(course: String) = "review/$course"

    const val PLACEMENT = "placement/{course}"
    fun placement(course: String) = "placement/$course"

    /** The learning path: the road, the week, why this mix, and Build my path. */
    const val PATH = "path"
    const val PATH_WEEK = "path/week"
    const val PATH_WHY = "path/why"
    const val PATH_BUILD = "path/build"

    const val SETTINGS = "settings"
    /** The Help chat, opened from Settings. */
    const val HELP = "help"
    /** The Help chat opened from a "a person replied" notification: it pops back to wherever the learner was. */
    const val HELP_REPLY = "help/reply"
    /** What Alphonso remembers (free for every learner). */
    const val MEMORY = "memory"
    const val LEAGUE = "league"
    const val TEAMS = "teams"
    const val SEASON = "season"
    const val FRIENDS = "friends"
    /** Invite friends: the learner's referral link, share, counts, and the manual invite-code fallback. */
    const val REFERRAL = "referral"
    const val DUELS = "duels"
    const val ACHIEVEMENTS = "achievements"

    const val SCENARIO = "practice/scenario/{id}?mode={mode}"
    fun scenario(id: String, mode: String = "call") = "practice/scenario/$id?mode=$mode"
    const val CAMPAIGN = "practice/campaign/{id}?scene={scene}&mode={mode}"
    fun campaign(id: String, scene: Int = 0, mode: String = "call") = "practice/campaign/$id?scene=$scene&mode=$mode"

    /** Rehearsals: the plan or the intake (the screen decides), the stage call, and the Pro screen opened from the entry sheet. */
    const val REHEARSAL = "rehearsal?mode={mode}"
    fun rehearsal(mode: String = "") = "rehearsal?mode=$mode"
    const val REHEARSAL_CALL = "rehearsal/call/{id}/{stage}"
    fun rehearsalCall(id: String, stage: String) = "rehearsal/call/$id/$stage"
    const val REHEARSAL_PRO = "rehearsal/pro"

    const val LISTEN_FOLDER = "listen/folder/{id}"
    const val STORIES = "listen/stories/{course}"
    fun stories(course: String) = "listen/stories/$course"
    const val STORY = "listen/story/{id}"
    fun story(id: String) = "listen/story/$id"
    fun listenFolder(id: String) = "listen/folder/$id"

    const val INVITE = "invite/{code}"
    fun invite(code: String) = "invite/${Uri.encode(code)}"

    val tabs = listOf(LEARN, LISTEN, PRACTICE, HECTOR, PROFILE)
}
