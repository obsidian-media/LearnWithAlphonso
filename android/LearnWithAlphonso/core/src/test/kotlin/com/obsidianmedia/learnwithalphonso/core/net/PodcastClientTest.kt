package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** Ported from PodcastClientTests.swift; every request goes through the fake engine. */
class PodcastClientTest {
    private val now = 1_758_000_000_000L
    private fun client(fake: FakeSupabase) = PodcastClient(fake.http, { "user-1" }) { now }
    private fun episodeRow(id: String = "e1", duration: Int = 300, audioPath: String = "en/a1/ordering-coffee.mp3") =
        """{"id":"$id","folder_id":"f1","slug":"ordering-coffee","title":"Ordering Coffee","description":null,"audio_path":"$audioPath","duration_seconds":$duration}"""

    @Test
    fun `fetchFolders maps snake_case rows`() = runTest {
        val fake = FakeSupabase { json("""[{"id":"f1","parent_id":null,"slug":"en","title":"English","description":"All English audio","sort_order":2}]""") }
        val folders = client(fake).fetchFolders()
        assertEquals(1, folders.size)
        assertEquals("f1", folders[0].id)
        assertNull(folders[0].parentId)
        assertEquals("en", folders[0].slug)
        assertEquals(2, folders[0].sortOrder)
        assertEquals("id,parent_id,slug,title,description,sort_order", fake.seen.single().query["select"])
    }

    @Test
    fun `fetchEpisodes merges the saved position, clamps past the end, survives a failed playback read, skips no-audio rows`() = runTest {
        val fake = FakeSupabase { req ->
            if (req.path.endsWith("podcast_episodes")) json("[${episodeRow()},${episodeRow("e2", 300, "")}]")
            else json("""[{"episode_id":"e1","position_seconds":90,"updated_at":"2026-09-24T10:00:00Z"}]""")
        }
        val episodes = client(fake).fetchEpisodes("f1")
        assertEquals(listOf("e1"), episodes.map { it.id })
        assertEquals(90, episodes[0].positionSeconds)
        assertEquals("2026-09-24T10:00:00Z", episodes[0].playbackUpdatedAt)
        assertTrue(episodes[0].audioUrl.endsWith("ordering-coffee.mp3"))
        assertEquals("eq.f1", fake.seen[0].query["folder_id"])

        val past = FakeSupabase { req -> if (req.path.endsWith("podcast_episodes")) json("[${episodeRow()}]") else json("""[{"episode_id":"e1","position_seconds":400,"updated_at":"x"}]""") }
        assertEquals(0, client(past).fetchEpisodes("f1")[0].positionSeconds)

        val failing = FakeSupabase { req -> if (req.path.endsWith("podcast_episodes")) json("[${episodeRow()}]") else json("{}", HttpStatusCode.InternalServerError) }
        val still = client(failing).fetchEpisodes("f1")
        assertEquals(1, still.size)
        assertEquals(0, still[0].positionSeconds)
        assertNull(still[0].playbackUpdatedAt)
    }

    @Test
    fun `unauthorized is distinct`() = runTest {
        val fake = FakeSupabase { json("{}", HttpStatusCode.Unauthorized) }
        assertThrows<PodcastClientError.Unauthorized> { client(fake).fetchFolders() }
    }

    @Test
    fun `search sends the encoded or filter, skips the network for short queries, returns no resume position`() = runTest {
        val fake = FakeSupabase { json("[${episodeRow()}]") }
        val results = client(fake).searchEpisodes("coffee")
        val req = fake.seen.single()
        assertEquals("(title.ilike.\"%coffee%\",description.ilike.\"%coffee%\")", req.query["or"])
        assertFalse(req.encodedQuery.contains("\""), req.encodedQuery)
        assertTrue(req.encodedQuery.contains("%22"), req.encodedQuery)
        assertEquals("title.asc", req.query["order"])
        assertEquals(0, results.single().positionSeconds)
        assertNull(results.single().playbackUpdatedAt)

        val short = FakeSupabase { json("[]") }
        assertTrue(client(short).searchEpisodes("c").isEmpty())
        assertEquals(0, short.seen.size, "a one-character query must not reach the network")
    }

    @Test
    fun `transcript returns the text or null`() = runTest {
        val fake = FakeSupabase { json("""[{"text":"One.\n\nTwo."}]""") }
        assertEquals("One.\n\nTwo.", client(fake).fetchTranscript("e1"))
        assertEquals("eq.e1", fake.seen.single().query["episode_id"])
        assertNull(client(FakeSupabase { json("[]") }).fetchTranscript("e1"))
    }

    @Test
    fun `record play event calls the RPC rather than inserting`() = runTest {
        val fake = FakeSupabase { json("") }
        client(fake).recordPlayEvent("e1", 42)
        val req = fake.seen.single()
        assertEquals("POST", req.method)
        assertEquals("/rest/v1/rpc/record_podcast_play_event", req.path)
        assertEquals("""{"_episode_id":"e1","_seconds_listened":42}""", req.body)
    }

    @Test
    fun `save guards on the updated_at it last read, accepts a rewind, reports a stale write, posts with user_id when no row exists, marks completion`() = runTest {
        val fake = FakeSupabase { json("""[{"position_seconds":30}]""") }
        client(fake).savePlaybackPosition("e1", 30, false, "2026-09-24T10:00:00Z")
        val patch = fake.seen.single()
        assertEquals("PATCH", patch.method)
        assertEquals("eq.e1", patch.query["episode_id"])
        assertEquals("eq.2026-09-24T10:00:00Z", patch.query["updated_at"])
        assertEquals("return=representation", patch.headers["Prefer"])
        val body = Json.parseToJsonElement(patch.body).jsonObject
        assertEquals(30, body["position_seconds"]!!.jsonPrimitive.content.toInt())
        assertNull(body["user_id"])
        assertNull(body["completed_at"])

        assertThrows<PodcastClientError.StaleWrite> { client(FakeSupabase { json("[]") }).savePlaybackPosition("e1", 90, false, "2026-09-24T10:00:00Z") }

        val post = FakeSupabase { json("""[{"position_seconds":5}]""") }
        client(post).savePlaybackPosition("e1", 5, false, null)
        assertEquals("POST", post.seen.single().method)
        assertEquals("user-1", Json.parseToJsonElement(post.seen.single().body).jsonObject["user_id"]!!.jsonPrimitive.content)

        val done = FakeSupabase { json("""[{"position_seconds":0}]""") }
        client(done).savePlaybackPosition("e1", 0, true, "2026-09-24T10:00:00Z")
        assertEquals("2025-09-16T05:20:00Z", Json.parseToJsonElement(done.seen.single().body).jsonObject["completed_at"]!!.jsonPrimitive.content)
    }
}
