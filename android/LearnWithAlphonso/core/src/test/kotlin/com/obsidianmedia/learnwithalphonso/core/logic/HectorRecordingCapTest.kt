package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class HectorRecordingCapTest {
    @Test fun `a tapped recording is capped at a minute, the same on every platform`() {
        assertEquals(60, HectorRecordingCap.SECONDS)
        assertEquals(60_000L, HectorRecordingCap.MILLIS)
    }
}
