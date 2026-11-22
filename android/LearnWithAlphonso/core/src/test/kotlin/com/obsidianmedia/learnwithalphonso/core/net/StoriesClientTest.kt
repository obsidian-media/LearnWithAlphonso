package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizAnswer
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizError
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizException
import com.obsidianmedia.learnwithalphonso.core.podcast.Stories
import com.obsidianmedia.learnwithalphonso.core.podcast.StoryCoverProbe
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** Reading stories, saving progress and the server-graded check, over the fake Supabase (no network). */
class StoriesClientTest {
    private val storyId = "22222222-2222-4222-8222-222222222222"
    private fun client(fake: FakeSupabase) = StoriesClient(fake.http)
    private val answers = listOf(PodcastQuizAnswer("q1", 1), PodcastQuizAnswer("q2", 0))
    private val applied = """{"status":"applied","correct":2,"total":3,"bestCorrect":2,"missedQuestionIds":["q3"],"credited":true}"""
    private fun storyRow(segments: String = """["One.","Two.","Three."]""", course: String = "en") =
        """{"id":"$storyId","course":"$course","level_id":"A1","slug":"s","title":"Tom","sort_order":1,"published":true,"segments":$segments}"""

    private suspend fun submitError(status: HttpStatusCode, body: String = "{}"): PodcastQuizError =
        assertThrows<PodcastQuizException> { client(FakeSupabase { json(body, status) }).submitCheck(storyId, answers) }.error

    @Test
    fun `the library reads published stories of the course and merges progress`() = runTest {
        val fake = FakeSupabase { req ->
            if (req.path.endsWith("/stories")) json("[${storyRow()}]")
            else json("""[{"story_id":"$storyId","segment_index":2,"best_correct":2,"check_total":3,"completed_at":"2026-11-18T00:00:00Z"}]""")
        }
        val stories = client(fake).fetchStories("en")
        assertEquals(1, stories.size)
        assertEquals(3, stories[0].segmentCount)
        assertEquals(2, stories[0].segmentIndex)
        assertEquals(2, stories[0].bestCorrect)
        assertEquals(3, stories[0].checkTotal)
        assertTrue(stories[0].completed)
        assertEquals("eq.en", fake.seen[0].query["course"])
        assertEquals("eq.true", fake.seen[0].query["published"])
    }

    @Test
    fun `a branching card takes the first scene art and counts only real endings found`() = runTest {
        val nodes = """{"start":"n1","map":{
            "n1":{"segments":["a"],"art":"en/key/n1.jpg","next":"e1"},
            "e1":{"segments":["b"],"ending":{"id":"good","title":"G","wrap":"w","quality":"good"}},
            "e2":{"segments":["c"],"ending":{"id":"bad","title":"B","wrap":"w","quality":"lesser"}}}}"""
        val row = """{"id":"$storyId","course":"en","level_id":"A2","slug":"key","title":"The Key","sort_order":3,"published":true,"branching":true,"segments":[],"nodes":$nodes}"""
        val fake = FakeSupabase { req ->
            if (req.path.endsWith("/stories")) json("[$row]")
            else json("""[{"story_id":"$storyId","segment_index":0,"endings_found":["good","ghost"]}]""")
        }
        val story = client(fake).fetchStories("en").single()
        assertEquals(2, story.endingsTotal)
        assertEquals(1, story.endingsFound)
        assertTrue(story.coverUrl!!.endsWith("/storage/v1/object/public/story-art/en/key/n1.jpg"))
        assertTrue(fake.seen[0].query["select"]!!.contains("nodes"))
    }

    // ---- Linear story covers (owner pick 3): illustrated by convention, gradient when the object is missing.

    private fun linearRow(slug: String) =
        """{"id":"$storyId","course":"en","level_id":"A1","slug":"$slug","title":"Lucy","sort_order":1,"published":true,"segments":["One."]}"""

    private fun coverFake(rows: String, headStatus: () -> HttpStatusCode) = FakeSupabase { req ->
        when {
            req.method == "HEAD" -> json("", headStatus())
            req.path.endsWith("/stories") -> json(rows)
            else -> json("[]")
        }
    }

    @Test
    fun `a linear story reads its cover by convention when the object exists`() = runTest {
        val fake = coverFake("[${linearRow("lucys-morning")}]") { HttpStatusCode.OK }
        val story = StoriesClient(fake.http, StoryCoverProbe()).fetchStories("en").single()
        assertEquals("https://example.supabase.co/storage/v1/object/public/story-art/en/lucys-morning/cover.jpg", story.coverUrl)
        assertEquals(1, fake.seen.count { it.method == "HEAD" }, "an existence check, never a download")
    }

    @Test
    fun `a linear story with no cover object falls back to the gradient (null, never a broken image)`() = runTest {
        val fake = coverFake("[${linearRow("no-art")}]") { HttpStatusCode.NotFound }
        assertNull(StoriesClient(fake.http, StoryCoverProbe()).fetchStories("en").single().coverUrl)
    }

    @Test
    fun `the cover is looked up once, not on every library load`() = runTest {
        val fake = coverFake("[${linearRow("lucys-morning")}]") { HttpStatusCode.OK }
        val client = StoriesClient(fake.http, StoryCoverProbe())
        repeat(3) { client.fetchStories("en") }
        assertEquals(1, fake.seen.count { it.method == "HEAD" })
    }

    @Test
    fun `a missing cover is asked about again after the window, so later art appears`() = runTest {
        var clock = 1_000L
        var present = false
        val fake = coverFake("[${linearRow("later")}]") { if (present) HttpStatusCode.OK else HttpStatusCode.NotFound }
        val client = StoriesClient(fake.http, StoryCoverProbe(now = { clock }, missingTtlMs = 60_000))
        assertNull(client.fetchStories("en").single().coverUrl)
        present = true
        clock += 30_000
        assertNull(client.fetchStories("en").single().coverUrl, "still inside the window: no new request")
        clock += 31_000
        assertTrue(client.fetchStories("en").single().coverUrl != null)
        assertEquals(2, fake.seen.count { it.method == "HEAD" })
    }

    @Test
    fun `a failed check is not remembered as missing`() = runTest {
        var status = HttpStatusCode.ServiceUnavailable
        val fake = coverFake("[${linearRow("flaky")}]") { status }
        val client = StoriesClient(fake.http, StoryCoverProbe())
        assertNull(client.fetchStories("en").single().coverUrl)
        status = HttpStatusCode.OK
        assertTrue(client.fetchStories("en").single().coverUrl != null)
    }

    @Test
    fun `a branching story keeps its scene art and is never probed`() = runTest {
        val nodes = """{"start":"n1","map":{"n1":{"segments":["a"],"art":"en/key/n1.jpg","ending":{"id":"good","title":"G","wrap":"w","quality":"good"}}}}"""
        val row = """{"id":"$storyId","course":"en","level_id":"A2","slug":"key","title":"The Key","sort_order":3,"published":true,"branching":true,"segments":[],"nodes":$nodes}"""
        val fake = coverFake("[$row]") { HttpStatusCode.OK }
        val story = StoriesClient(fake.http, StoryCoverProbe()).fetchStories("en").single()
        assertTrue(story.coverUrl!!.endsWith("/en/key/n1.jpg"))
        assertEquals(0, fake.seen.count { it.method == "HEAD" })
    }

    @Test
    fun `the cover convention is course slash slug slash cover dot jpg, beside the branching scene art`() {
        assertEquals("en/lucys-morning/cover.jpg", Stories.linearCoverKey("en", "lucys-morning"))
        assertNull(Stories.linearCoverUrl("https://x.supabase.co", "en", ""))
    }

    @Test
    fun `a failed progress read never fails the library`() = runTest {
        val fake = FakeSupabase { req -> if (req.path.endsWith("/stories")) json("[${storyRow()}]") else json("{}", HttpStatusCode.InternalServerError) }
        val stories = client(fake).fetchStories("en")
        assertEquals(0, stories.single().segmentIndex)
        assertFalse(stories.single().completed)
    }

    @Test
    fun `an unknown course asks nothing`() = runTest {
        val fake = FakeSupabase { json("[]") }
        assertTrue(client(fake).fetchStories("de").isEmpty())
        assertEquals(0, fake.seen.size)
    }

    @Test
    fun `a story is read with questions keyed by position and a clamped resume point`() = runTest {
        val fake = FakeSupabase { req ->
            when {
                req.path.endsWith("/stories") -> json("[${storyRow("""["Un.","Deux."]""", "fr")}]")
                req.path.endsWith("/story_quiz_questions") -> json("""[{"position":1,"prompt":"Q?","choices":["a","b"],"answer_index":1}]""")
                else -> json("""[{"segment_index":9}]""")
            }
        }
        val story = client(fake).fetchStory(storyId)!!
        assertEquals(listOf("q1"), story.questions.map { it.id })
        assertEquals(1, story.questions[0].answerIndex)
        assertEquals(1, story.segmentIndex)
        assertEquals("fr", story.course)
        assertEquals("position.asc", fake.seen.first { it.path.endsWith("/story_quiz_questions") }.query["order"])
    }

    @Test
    fun `a story with no sentences is null, not an empty reader`() = runTest {
        val fake = FakeSupabase { req -> if (req.path.endsWith("/stories")) json("[${storyRow("[]")}]") else json("[]") }
        assertNull(client(fake).fetchStory(storyId))
    }

    @Test
    fun `a missing or unpublished story is null`() = runTest {
        assertNull(client(FakeSupabase { json("[]") }).fetchStory(storyId))
    }

    @Test
    fun `an unreadable question row is an error, not a shorter check`() = runTest {
        val bad = listOf(
            """{"position":1,"prompt":"Q?","choices":["a","b"],"answer_index":7}""",
            """{"position":1,"prompt":"Q?","choices":["a",2],"answer_index":0}""",
            """{"prompt":"Q?","choices":["a"],"answer_index":0}""",
        )
        for (row in bad) {
            val fake = FakeSupabase { req -> if (req.path.endsWith("/stories")) json("[${storyRow()}]") else json("[$row]") }
            assertThrows<PodcastClientError.InvalidPayload>(row) { client(fake).fetchStory(storyId) }
        }
    }

    @Test
    fun `progress goes through the rpc with a clamped position`() = runTest {
        val fake = FakeSupabase { json("[]") }
        client(fake).saveProgress(storyId, 900)
        val seen = fake.seen.single()
        assertEquals("POST", seen.method)
        assertEquals("/rest/v1/rpc/save_story_progress", seen.path)
        val body = Json.parseToJsonElement(seen.body).jsonObject
        assertEquals(setOf("p_story_id", "p_segment_index"), body.keys)
        assertEquals(59, body["p_segment_index"]!!.jsonPrimitive.content.toInt())
    }

    @Test
    fun `the check sends the story and only questionId and choiceIndex, to the Edge Function, never the rpc`() = runTest {
        val fake = FakeSupabase { json(applied) }
        val result = client(fake).submitCheck(storyId, answers)
        val seen = fake.seen.single()
        assertEquals("POST", seen.method)
        assertEquals("/functions/v1/complete-story-check", seen.path)
        assertFalse(seen.path.contains("rpc"))
        val body = Json.parseToJsonElement(seen.body).jsonObject
        assertEquals(setOf("storyId", "answers"), body.keys, "answers only: never a score, never a user id")
        body["answers"]!!.jsonArray.forEach { assertEquals(setOf("questionId", "choiceIndex"), it.jsonObject.keys) }
        // The shown score is the server's, and a story check pays no XP.
        assertEquals(2, result.correct)
        assertEquals(3, result.total)
        assertEquals(2, result.bestCorrect)
        assertEquals(0, result.xpGain)
        assertEquals(listOf("q3"), result.missedQuestionIds)
    }

    @Test
    fun `the checks refusals map to stable errors`() = runTest {
        assertEquals(PodcastQuizError.NOT_FOUND, submitError(HttpStatusCode.NotFound))
        assertEquals(PodcastQuizError.INVALID_ANSWERS, submitError(HttpStatusCode.BadRequest))
        assertEquals(PodcastQuizError.UNAUTHORIZED, submitError(HttpStatusCode.Unauthorized))
        assertEquals(PodcastQuizError.UNAUTHORIZED, submitError(HttpStatusCode.Forbidden))
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.ServiceUnavailable))
    }

    @Test
    fun `a 2xx that is not a readable applied result is an error, never a score`() = runTest {
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.OK, "not json"))
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.OK, "[]"))
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.OK, """{"status":"applied","correct":1}"""))
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.OK, applied.replace("applied", "ignored")))
    }

    @Test
    fun `a transport failure is offline`() = runTest {
        val fake = FakeSupabase { throw java.io.IOException("no route") }
        val e = assertThrows<PodcastQuizException> { client(fake).submitCheck(storyId, answers) }
        assertEquals(PodcastQuizError.OFFLINE, e.error)
    }
}
