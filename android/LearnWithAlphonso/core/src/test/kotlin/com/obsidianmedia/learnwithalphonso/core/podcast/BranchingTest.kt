package com.obsidianmedia.learnwithalphonso.core.podcast

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase
import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import com.obsidianmedia.learnwithalphonso.core.net.StoriesClient
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Interactive branching stories: the walk (the twin of public.finish_branching_story and of BranchingTests.swift), stars, the
 * scene-art URL, loading the graph, and finishing a path through the Edge Function. Same fixtures as the iOS tests.
 */
class BranchingTest {
    private val base = "https://project.supabase.co"
    private val storyId = "22222222-2222-4222-8222-222222222222"

    private fun ending(id: String, quality: EndingQuality) = StoryEnding(id, id, "wrap $id", quality)

    /** start (choice) -> a (link) -> b (choice) -> {good, lesser}; start's other option -> ok. */
    private val graph = StoryGraph(
        "start",
        mapOf(
            "start" to StoryNode(listOf("s"), choice = StoryChoice("p", listOf(StoryChoiceOption("run", "a", true), StoryChoiceOption("eat", "okEnd", false)))),
            "a" to StoryNode(listOf("a"), next = "b"),
            "b" to StoryNode(listOf("b"), choice = StoryChoice("q", listOf(StoryChoiceOption("kind", "goodEnd", true), StoryChoiceOption("keep", "lesserEnd", false)))),
            "goodEnd" to StoryNode(listOf("g"), ending = ending("good-id", EndingQuality.GOOD)),
            "lesserEnd" to StoryNode(listOf("l"), ending = ending("lesser-id", EndingQuality.LESSER)),
            "okEnd" to StoryNode(listOf("o"), ending = ending("ok-id", EndingQuality.OK)),
        ),
    )

    // ------------------------------------------------------------ the walk

    @Test
    fun `the walk waits at the first choice then follows links to the next`() {
        assertEquals(BranchWalk.Awaiting("start"), Branching.walk(graph, emptyList()))
        assertEquals(BranchWalk.Awaiting("b"), Branching.walk(graph, listOf(0)))
    }

    @Test
    fun `the walk ends at the ending the chosen options lead to`() {
        assertEquals(BranchWalk.Ended("goodEnd", ending("good-id", EndingQuality.GOOD)), Branching.walk(graph, listOf(0, 0)))
        assertEquals(BranchWalk.Ended("lesserEnd", ending("lesser-id", EndingQuality.LESSER)), Branching.walk(graph, listOf(0, 1)))
        assertEquals(BranchWalk.Ended("okEnd", ending("ok-id", EndingQuality.OK)), Branching.walk(graph, listOf(1)))
    }

    @Test
    fun `a fabricated path is invalid not an ending`() {
        assertEquals(BranchWalk.Invalid("unconsumed-path"), Branching.walk(graph, listOf(1, 0)))
        assertEquals(BranchWalk.Invalid("bad-option"), Branching.walk(graph, listOf(2)))
        assertEquals(BranchWalk.Invalid("bad-option"), Branching.walk(graph, listOf(-1)))
    }

    @Test
    fun `a broken graph is invalid and an endless one stops`() {
        val missing = StoryGraph("x", mapOf("x" to StoryNode(listOf("x"), next = "ghost")))
        assertEquals(BranchWalk.Invalid("missing-node"), Branching.walk(missing, emptyList()))
        val dead = StoryGraph("x", mapOf("x" to StoryNode(listOf("x"))))
        assertEquals(BranchWalk.Invalid("dead-node"), Branching.walk(dead, emptyList()))
        val loop = StoryGraph("x", mapOf("x" to StoryNode(listOf("x"), next = "y"), "y" to StoryNode(listOf("y"), next = "x")))
        assertEquals(BranchWalk.Invalid("too-deep"), Branching.walk(loop, emptyList()))
    }

    @Test
    fun `a node kind is one of choice link ending or invalid`() {
        assertEquals(NodeKind.CHOICE, Branching.nodeKind(graph.map["start"]))
        assertEquals(NodeKind.LINK, Branching.nodeKind(graph.map["a"]))
        assertEquals(NodeKind.ENDING, Branching.nodeKind(graph.map["goodEnd"]))
        assertEquals(NodeKind.INVALID, Branching.nodeKind(StoryNode(listOf("x"))))
        assertEquals(NodeKind.INVALID, Branching.nodeKind(StoryNode(listOf("x"), choice = StoryChoice("p", emptyList()))))
        assertEquals(NodeKind.INVALID, Branching.nodeKind(null))
    }

    @Test
    fun `choosing an option outside the list is null`() {
        assertEquals("a", Branching.chooseOption(graph, "start", 0))
        assertEquals("okEnd", Branching.chooseOption(graph, "start", 1))
        assertNull(Branching.chooseOption(graph, "start", 2))
        assertNull(Branching.chooseOption(graph, "start", -1))
        assertNull(Branching.chooseOption(graph, "a", 0))
        assertNull(Branching.chooseOption(graph, "ghost", 0))
    }

    @Test
    fun `every ending is listed in a stable order`() {
        assertEquals(listOf("good-id", "lesser-id", "ok-id"), Branching.allEndings(graph).map { it.id })
    }

    @Test
    fun `stars blend reaching an ending a good one and finding them all`() {
        assertEquals(0, Branching.stars(0, 3, false))
        assertEquals(1, Branching.stars(1, 3, false))
        assertEquals(2, Branching.stars(1, 3, true))
        assertEquals(2, Branching.stars(3, 3, false))
        assertEquals(3, Branching.stars(3, 3, true))
        assertEquals(1, Branching.stars(1, 0, false), "no total means no all-found star")
    }

    @Test
    fun `reached good reads the stored graph not a claim`() {
        assertTrue(Branching.reachedGood(graph, listOf("good-id")))
        assertFalse(Branching.reachedGood(graph, listOf("lesser-id", "ok-id")))
        assertFalse(Branching.reachedGood(graph, listOf("made-up-good")))
    }

    // ------------------------------------------------------------ scene art

    @Test
    fun `scene art is the buckets public url or null for no key`() {
        assertEquals("$base/storage/v1/object/public/story-art/en/a-day/n1.jpg", Branching.artUrl(base, "en/a-day/n1.jpg"))
        assertEquals("$base/storage/v1/object/public/story-art/en/a-day/n1.jpg", Branching.artUrl("$base/", "en/a-day/n1.jpg"))
        assertNull(Branching.artUrl(base, null))
        assertNull(Branching.artUrl(base, ""))
        assertNull(Branching.artUrl(base, "en/../secret.jpg"), "a key cannot climb out of the bucket")
    }

    // ------------------------------------------------------------ loading

    private val storedNodes = """
        {"start":"n1","map":{
          "n1":{"art":"en/s/n1.jpg","segments":["One."],"choice":{"prompt":"Which?","options":[{"label":"A","goto":"n2","clue":true},{"label":"B","goto":"n3","clue":false}]}},
          "n2":{"segments":["Two."],"ending":{"id":"e2","title":"T","wrap":"W","quality":"good"}},
          "n3":{"segments":["Three."],"next":"n2"}
        }}
    """.trimIndent()

    private fun client(fake: FakeSupabase) = StoriesClient(fake.http)

    @Test
    fun `a branching story is read with its graph and art urls`() = runTest {
        val fake = FakeSupabase { json("""[{"id":"$storyId","course":"en","level_id":"A2","title":"A Day","nodes":$storedNodes,"branching":true,"published":true}]""") }
        val story = client(fake).fetchBranchingStory(storyId)!!
        val seen = fake.seen.single()
        assertEquals("eq.true", seen.query["published"])
        assertEquals("eq.true", seen.query["branching"])
        assertEquals("A Day", story.title)
        assertEquals("n1", story.graph.start)
        assertEquals("https://example.supabase.co/storage/v1/object/public/story-art/en/s/n1.jpg", story.graph.map["n1"]?.artUrl)
        assertNull(story.graph.map["n2"]?.artUrl, "a node with no art key has no URL: the reader draws a placeholder")
        assertEquals(listOf("n2", "n3"), story.graph.map["n1"]?.choice?.options?.map { it.goto })
        assertEquals(StoryEnding("e2", "T", "W", EndingQuality.GOOD), story.graph.map["n2"]?.ending)
        assertEquals("n2", story.graph.map["n3"]?.next)
        assertEquals(BranchWalk.Ended("n2", story.graph.map["n2"]!!.ending!!), Branching.walk(story.graph, listOf(0)))
    }

    @Test
    fun `a missing story or a graph without a start node is null`() = runTest {
        assertNull(client(FakeSupabase { json("[]") }).fetchBranchingStory(storyId))
        val noStart = """[{"id":"$storyId","course":"en","level_id":"A2","title":"T","nodes":{"start":"ghost","map":{"n1":{"segments":["x"]}}}}]"""
        assertNull(client(FakeSupabase { json(noStart) }).fetchBranchingStory(storyId))
        val badCourse = """[{"id":"$storyId","course":"de","level_id":"A2","title":"T","nodes":$storedNodes}]"""
        assertNull(client(FakeSupabase { json(badCourse) }).fetchBranchingStory(storyId))
    }

    @Test
    fun `the library flags branching stories and says choose your path`() = runTest {
        val fake = FakeSupabase { req ->
            if (req.path.endsWith("/story_progress")) json("[]")
            else json("""[{"id":"$storyId","course":"en","level_id":"A2","slug":"a-day","title":"A Day","segments":[],"sort_order":1,"published":true,"branching":true}]""")
        }
        val list = client(fake).fetchStories("en")
        assertTrue(list[0].branching)
        assertTrue(fake.seen[0].query["select"]!!.contains("branching"))
        assertEquals(1, Stories.visible(list, "en").size)
        assertEquals("Choose your path", Stories.status(list[0]))
        assertEquals("Ending found, try another path", Stories.status(list[0].copy(completed = true)))
    }

    // ------------------------------------------------------------ finishing

    private val applied = """{"status":"applied","endingId":"good-id","quality":"good","endingsFound":["good-id"],"endingsTotal":4,"credited":true}"""

    @Test
    fun `finishing sends only the path to the edge function never an ending never the rpc`() = runTest {
        val fake = FakeSupabase { json(applied) }
        val result = client(fake).finishBranching(storyId, listOf(0, 1))
        val seen = fake.seen.single()
        assertEquals("POST", seen.method)
        assertEquals("/functions/v1/finish-branching-story", seen.path)
        assertFalse(seen.path.contains("rpc"))
        assertEquals("Bearer user-access-token", seen.headers.entries.first { it.key.equals("Authorization", true) }.value)
        val body = Json.parseToJsonElement(seen.body).jsonObject
        assertEquals(setOf("storyId", "path"), body.keys, "the path only: never an ending, a credit or a user id")
        assertEquals(listOf(0, 1), body["path"]!!.jsonArray.map { it.jsonPrimitive.content.toInt() })
        assertEquals("good-id", result.endingId, "the shown ending is the server's")
        assertEquals(EndingQuality.GOOD, result.quality)
        assertEquals(listOf("good-id"), result.endingsFound)
        assertEquals(4, result.endingsTotal)
        assertTrue(result.credited)
    }

    private suspend fun finishError(status: HttpStatusCode, body: String = "{}"): PodcastQuizError =
        assertThrows<PodcastQuizException> { client(FakeSupabase { json(body, status) }).finishBranching(storyId, listOf(0)) }.error

    @Test
    fun `finish refusals map to stable errors`() = runTest {
        assertEquals(PodcastQuizError.NOT_FOUND, finishError(HttpStatusCode.NotFound))
        assertEquals(PodcastQuizError.INVALID_ANSWERS, finishError(HttpStatusCode.BadRequest))
        assertEquals(PodcastQuizError.UNAUTHORIZED, finishError(HttpStatusCode.Unauthorized))
        assertEquals(PodcastQuizError.UNAUTHORIZED, finishError(HttpStatusCode.Forbidden))
        assertEquals(PodcastQuizError.SERVER, finishError(HttpStatusCode.ServiceUnavailable))
    }

    @Test
    fun `an unreadable success is an error never an ending`() = runTest {
        assertEquals(PodcastQuizError.SERVER, finishError(HttpStatusCode.OK, """{"status":"applied"}"""))
        assertEquals(PodcastQuizError.SERVER, finishError(HttpStatusCode.OK, applied.replace("applied", "ignored")))
        assertEquals(PodcastQuizError.SERVER, finishError(HttpStatusCode.OK, applied.replace("good\"", "bogus\"")))
        assertEquals(PodcastQuizError.SERVER, finishError(HttpStatusCode.OK, "not json"))
    }

    @Test
    fun `a network failure is retryable offline`() = runTest {
        val fake = FakeSupabase { throw java.io.IOException("no route") }
        val e = assertThrows<PodcastQuizException> { client(fake).finishBranching(storyId, emptyList()) }
        assertEquals(PodcastQuizError.OFFLINE, e.error)
        assertNotNull(e)
    }
}
