package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.Assert.assertEquals
import org.junit.Test

class HectorRecordingCapTest {
    @Test fun `a tapped recording is capped at a minute, the same on every platform`() {
        assertEquals(60, HectorRecordingCap.SECONDS)
        assertEquals(60_000L, HectorRecordingCap.MILLIS)
    }
}
