package com.obsidianmedia.learnwithalphonso.core.avatar

/**
 * Which picture a screen scene shows: the day image (assets/screen-scenes/<name>.jpg) or, in Royal night, the night
 * image (night-<name>.jpg). Mirrors the iOS Kit's ScreenSceneArt and the web's sceneSrc.
 */
object ScreenSceneArt {
    /** The scenes that have a Royal-night picture. Lesson complete has none: it stays light. */
    val nightScenes: Set<String> = setOf("hector", "learn", "listen", "practice", "profile")

    /** [night] is true only for Royal on a dark device (AlphonsoPalettes.usesNight), never for Meadow. */
    fun file(scene: String, night: Boolean): String =
        if (night && scene in nightScenes) "night-$scene" else scene

    fun assetPath(scene: String, night: Boolean): String = "screen-scenes/${file(scene, night)}.jpg"
}
