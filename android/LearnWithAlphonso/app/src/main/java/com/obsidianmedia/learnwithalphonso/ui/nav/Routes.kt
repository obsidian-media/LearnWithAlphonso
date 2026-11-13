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
    const val LEAGUE = "league"
    const val TEAMS = "teams"
    const val SEASON = "season"
    const val FRIENDS = "friends"
    const val DUELS = "duels"
    const val ACHIEVEMENTS = "achievements"

    const val SCENARIO = "practice/scenario/{id}?mode={mode}"
    fun scenario(id: String, mode: String = "call") = "practice/scenario/$id?mode=$mode"
    const val CAMPAIGN = "practice/campaign/{id}?scene={scene}&mode={mode}"
    fun campaign(id: String, scene: Int = 0, mode: String = "call") = "practice/campaign/$id?scene=$scene&mode=$mode"

    const val LISTEN_FOLDER = "listen/folder/{id}"
    fun listenFolder(id: String) = "listen/folder/$id"

    const val INVITE = "invite/{code}"
    fun invite(code: String) = "invite/${Uri.encode(code)}"

    val tabs = listOf(LEARN, LISTEN, PRACTICE, HECTOR, PROFILE)
}
