package com.obsidianmedia.learnwithalphonso.core.avatar

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ScreenSceneArtTest {
    @Test
    fun `night swaps the picture for the five scenes that have one`() {
        for (scene in listOf("learn", "hector", "listen", "profile", "practice")) {
            assertEquals("screen-scenes/night-$scene.jpg", ScreenSceneArt.assetPath(scene, night = true), scene)
            assertEquals("screen-scenes/$scene.jpg", ScreenSceneArt.assetPath(scene, night = false), scene)
        }
    }

    @Test
    fun `lesson complete stays light even in night`() {
        assertEquals("screen-scenes/complete.jpg", ScreenSceneArt.assetPath("complete", night = true))
    }
}
