package com.obsidianmedia.learnwithalphonso.audio

import android.Manifest
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Plan 3 Task 2: the real MediaRecorder path on the CI emulator. */
@RunWith(AndroidJUnit4::class)
class TurnRecorderTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Before
    fun grantMic() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.RECORD_AUDIO)
    }

    @Test
    fun aOneSecondCaptureProducesAnM4aAboveTheEngineMinimum() = runBlocking {
        val recorder = TurnRecorder(context)
        val before = RecordingState.activeCount()
        recorder.start()
        assertEquals(before + 1, RecordingState.activeCount())
        assertNotNull(recorder.remainingMillisToMinimumDuration())
        delay(1_000)
        assertNull(recorder.remainingMillisToMinimumDuration())
        assertTrue(recorder.elapsedMillis()!! >= 1_000)
        val bytes = recorder.stop()
        assertEquals(before, RecordingState.activeCount())
        assertNotNull(bytes)
        assertTrue("captured ${bytes!!.size} bytes", bytes.size >= ConversationTurnEngine.MINIMUM_AUDIO_BYTES)
        // MPEG-4 container: 'ftyp' box at offset 4.
        assertEquals("ftyp", String(bytes, 4, 4, Charsets.US_ASCII))
        assertNull(recorder.stop())
        assertTrue(context.cacheDir.listFiles().orEmpty().none { it.name.startsWith("turn-") })
    }

    @Test
    fun cancelDropsTheCaptureAndTheCounter() = runBlocking {
        val recorder = TurnRecorder(context)
        val before = RecordingState.activeCount()
        recorder.start()
        delay(200)
        recorder.cancelIfRecording()
        assertEquals(before, RecordingState.activeCount())
        assertNull(recorder.stop())
        assertTrue(context.cacheDir.listFiles().orEmpty().none { it.name.startsWith("turn-") })
    }
}
