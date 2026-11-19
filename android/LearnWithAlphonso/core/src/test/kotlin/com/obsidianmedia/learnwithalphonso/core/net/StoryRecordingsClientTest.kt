package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.podcast.StoryRecordings
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Pre-recorded story narration: the manifest lookup, the no-consent rule, and the downloads (no network). */
class StoryRecordingsClientTest {
    private val storyId = "22222222-2222-4222-8222-222222222222"
    private fun manifest(vararg entries: Pair<String, String>, v: Int = 1) =
        """{"v":$v,"voice":"x","entries":[${entries.joinToString(",") { """{"text":"${it.first}","file":"${it.second}"}""" }}]}"""

    @Test
    fun `a sentence is found by its normalised text`() {
        val rec = StoryRecordings.parse(manifest("Mia wakes up." to "stories/s/a.mp3"))!!
        assertEquals("stories/s/a.mp3", rec.pathFor("  Mia   wakes\nup. "))
        assertNull(rec.pathFor("Mia wakes up!"))
    }

    @Test
    fun `no-break spaces normalise like the web and the generator`() {
        val rec = StoryRecordings.parse(manifest("Tu viens\u00a0? Oui\u202f!" to "stories/s/a.mp3"))!!
        assertEquals("stories/s/a.mp3", rec.pathFor("Tu viens ? Oui !"))
        assertEquals("stories/s/a.mp3", rec.pathFor("\ufeffTu  viens\u00a0?\u3000Oui\u202f!"))
    }

    @Test
    fun `a mixed story without consent is refused, so nothing is spent`() {
        val rec = StoryRecordings.parse(manifest("a" to "stories/s/a.mp3"))
        assertFalse(StoryRecordings.canNarrate(listOf("a", "b"), rec, aiConsentGranted = false))
    }

    @Test
    fun `composed and decomposed accents are the same sentence`() {
        val rec = StoryRecordings.parse(manifest("Café." to "stories/s/a.mp3"))!!
        assertEquals("stories/s/a.mp3", rec.pathFor("Café."))
    }

    @Test
    fun `another version, junk and files outside stories are rejected`() {
        assertNull(StoryRecordings.parse(manifest(v = 2)))
        assertNull(StoryRecordings.parse("<html>"))
        val rec = StoryRecordings.parse(manifest("a" to "podcast/x.mp3", "b" to "stories/../x.mp3", "c" to "stories/s/c.mp3"))!!
        assertEquals(1, rec.size)
        assertEquals("stories/s/c.mp3", rec.pathFor("c"))
    }

    @Test
    fun `a fully recorded story narrates without AI consent, anything else needs it as before`() {
        val rec = StoryRecordings.parse(manifest("a" to "stories/s/a.mp3", "b" to "stories/s/b.mp3"))
        assertTrue(StoryRecordings.canNarrate(listOf("a", "b"), rec, aiConsentGranted = false))
        assertFalse(StoryRecordings.canNarrate(listOf("a", "b", "c"), rec, aiConsentGranted = false))
        assertTrue(StoryRecordings.canNarrate(listOf("a", "b", "c"), rec, aiConsentGranted = true))
        assertFalse(StoryRecordings.canNarrate(listOf("a"), null, aiConsentGranted = false))
        assertFalse(StoryRecordings.canNarrate(emptyList(), rec, aiConsentGranted = false))
    }

    @Test
    fun `the manifest and the audio come from the public bucket without credentials`() = runTest {
        val seen = mutableListOf<Pair<String, String?>>()
        val engine = MockEngine { request ->
            seen += request.url.toString() to request.headers["Authorization"]
            if (request.url.encodedPath.endsWith("manifest.json")) respond(manifest("a" to "stories/s/a.mp3"), HttpStatusCode.OK)
            else respond(ByteArray(3) { 1 }, HttpStatusCode.OK)
        }
        val client = StoryRecordingsClient("https://p.supabase.co/", engine)
        assertEquals("stories/s/a.mp3", client.load(storyId)!!.pathFor("a"))
        assertEquals(3, client.audio("stories/s/a.mp3")!!.size)
        assertEquals("https://p.supabase.co/storage/v1/object/public/podcast-audio/stories/$storyId/manifest.json", seen[0].first)
        assertTrue(seen.all { it.second == null })
    }

    @Test
    fun `a missing or failing file is null, never a throw`() = runTest {
        val missing = StoryRecordingsClient("https://p.supabase.co", MockEngine { respond("no", HttpStatusCode.NotFound) })
        assertNull(missing.load(storyId))
        assertNull(missing.audio("stories/s/a.mp3"))
        val offline = StoryRecordingsClient("https://p.supabase.co", MockEngine { throw java.io.IOException("offline") })
        assertNull(offline.load(storyId))
        assertNull(offline.audio("stories/s/a.mp3"))
    }
}
