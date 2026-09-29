package com.obsidianmedia.learnwithalphonso.ui.nav

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

    const val SETTINGS = "settings"
    const val LEAGUE = "league"
    const val TEAMS = "teams"
    const val SEASON = "season"
    const val FRIENDS = "friends"
    const val DUELS = "duels"
    const val ACHIEVEMENTS = "achievements"

    const val INVITE = "invite/{code}"
    fun invite(code: String) = "invite/$code"

    val tabs = listOf(LEARN, LISTEN, PRACTICE, HECTOR, PROFILE)
}
