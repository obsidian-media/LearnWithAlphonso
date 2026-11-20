package com.obsidianmedia.learnwithalphonso.ui.listen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SceneArtSampleSizeTest {
    @Test fun smallAndUnreadableImagesAreNotSampled() {
        assertEquals(1, sceneArtSampleSize(0, 0))
        assertEquals(1, sceneArtSampleSize(800, 600))
        assertEquals(1, sceneArtSampleSize(1999, 1000))
    }

    @Test fun halvesWhileTheLongSideStaysAtOrAboveTheMax() {
        assertEquals(2, sceneArtSampleSize(2000, 1000))
        assertEquals(2, sceneArtSampleSize(1000, 3999))
        assertEquals(4, sceneArtSampleSize(4000, 3000))
        assertEquals(8, sceneArtSampleSize(8192, 4096))
    }

    @Test fun neverDecodesBelowTheMaxOnTheLongSide() {
        for (side in listOf(1200, 2048, 3000, 4096, 6000, 12000)) {
            val sample = sceneArtSampleSize(side, side / 2)
            assertTrue("$side / $sample", side / sample >= SCENE_ART_MAX_PX)
        }
    }
}
