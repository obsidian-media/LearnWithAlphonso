package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizAnswer
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizBest
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizError
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizException
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class PodcastClientQuizTest {
    private fun client(fake: FakeSupabase) = PodcastClient(fake.http, { "user-1" }) { 0L }
    private val answers = listOf(PodcastQuizAnswer("q1", 2), PodcastQuizAnswer("q2", 0))
    private val applied = """{"status":"applied","correct":1,"total":2,"xpGain":10,"streak":4,"bestCorrect":1,"bestXp":10,"missedQuestionIds":["q2"]}"""
    private fun qRow(id: String = "q1", choices: String = """["a","b","c"]""", answer: String = "1") =
        """{"id":"$id","prompt":"P $id","choices":$choices,"answer_index":$answer}"""

    private suspend fun submitError(status: HttpStatusCode, body: String = "{}"): PodcastQuizError {
        val e = assertThrows<PodcastQuizException> { client(FakeSupabase { json(body, status) }).submitQuiz("e1", answers, 0L) }
        return e.error
    }

    @Test
    fun `submit posts the episode, only questionId and choiceIndex per answer, and completedAt, never a score`() = runTest {
        val fake = FakeSupabase { json(applied) }
        val result = client(fake).submitQuiz("e1", answers, 1_758_000_000_000L)
        val seen = fake.seen.single()
        assertEquals("POST", seen.method)
        assertEquals("/functions/v1/complete-podcast-quiz", seen.path)
        val body = Json.parseToJsonElement(seen.body).jsonObject
        assertEquals(setOf("episodeId", "answers", "completedAt"), body.keys)
        assertEquals("e1", body["episodeId"]!!.jsonPrimitive.content)
        assertEquals("2025-09-16T05:20:00Z", body["completedAt"]!!.jsonPrimitive.content)
        val sent = body["answers"]!!.jsonArray.map { it.jsonObject }
        assertEquals(2, sent.size)
        sent.forEach { assertEquals(setOf("questionId", "choiceIndex"), it.keys) }
        assertEquals("q1", sent[0]["questionId"]!!.jsonPrimitive.content)
        assertEquals(2, sent[0]["choiceIndex"]!!.jsonPrimitive.content.toInt())
        // The shown score is the server's.
        assertEquals(1, result.correct)
        assertEquals(2, result.total)
        assertEquals(10, result.xpGain)
        assertEquals(4, result.streak)
        assertEquals(1, result.bestCorrect)
        assertEquals(10, result.bestXp)
        assertEquals(listOf("q2"), result.missedQuestionIds)
    }

    @Test
    fun `errors map by status`() = runTest {
        assertEquals(PodcastQuizError.RATE_LIMITED, submitError(HttpStatusCode.TooManyRequests, """{"error":"rate-limited"}"""))
        assertEquals(PodcastQuizError.NOT_FOUND, submitError(HttpStatusCode.NotFound))
        assertEquals(PodcastQuizError.INVALID_ANSWERS, submitError(HttpStatusCode.BadRequest))
        assertEquals(PodcastQuizError.UNAUTHORIZED, submitError(HttpStatusCode.Forbidden))
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.InternalServerError))
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.BadGateway))
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.Conflict))
    }

    @Test
    fun `a 2xx that is not a readable applied result is an error, never a score`() = runTest {
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.OK, "not json"))
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.OK, "[]"))
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.OK, """{"status":"applied","correct":1}"""))
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.OK, applied.replace("applied", "ignored")))
        assertEquals(PodcastQuizError.SERVER, submitError(HttpStatusCode.OK, applied.replace("\"xpGain\":10,", "")))
    }

    @Test
    fun `a transport failure is offline`() = runTest {
        val fake = FakeSupabase { throw java.io.IOException("no route") }
        val e = assertThrows<PodcastQuizException> { client(fake).submitQuiz("e1", answers, 0L) }
        assertEquals(PodcastQuizError.OFFLINE, e.error)
    }

    @Test
    fun `fetchQuiz reads questions in order and the banked best`() = runTest {
        val fake = FakeSupabase { req ->
            if (req.path.endsWith("podcast_quiz_questions")) json("[${qRow("q1")},${qRow("q2")}]")
            else json("""[{"best_correct":3,"best_xp":30}]""")
        }
        val offer = client(fake).fetchQuiz("e1")!!
        assertEquals(listOf("q1", "q2"), offer.questions.map { it.id })
        assertEquals(1, offer.questions[0].answerIndex)
        assertEquals(PodcastQuizBest(3, 30), offer.best)
        assertEquals("eq.e1", fake.seen[0].query["episode_id"])
        assertEquals("sort_order.asc", fake.seen[0].query["order"])
        assertEquals("eq.e1", fake.seen[1].query["episode_id"])
    }

    @Test
    fun `no questions means no quiz, and no best read`() = runTest {
        val fake = FakeSupabase { json("[]") }
        assertNull(client(fake).fetchQuiz("e1"))
        assertEquals(1, fake.seen.size)
    }

    @Test
    fun `a failed best read never hides the quiz`() = runTest {
        val fake = FakeSupabase { req ->
            if (req.path.endsWith("podcast_quiz_questions")) json("[${qRow()}]") else json("{}", HttpStatusCode.InternalServerError)
        }
        val offer = client(fake).fetchQuiz("e1")!!
        assertEquals(1, offer.questions.size)
        assertNull(offer.best)
    }

    @Test
    fun `a malformed question row fails loudly instead of being dropped`() = runTest {
        val bad = listOf(
            qRow(choices = "[\"a\",2]"),
            qRow(answer = "5"),
            qRow(answer = "-1"),
            qRow(answer = "null"),
            """{"id":"q1","prompt":"P","choices":"abc","answer_index":0}""",
            """{"prompt":"P","choices":["a"],"answer_index":0}""",
        )
        for (row in bad) {
            val fake = FakeSupabase { json("[${qRow("ok")},$row]") }
            assertThrows<PodcastClientError.InvalidPayload>(row) { client(fake).fetchQuiz("e1") }
        }
        assertThrows<PodcastClientError.InvalidPayload> { client(FakeSupabase { json("{}") }).fetchQuiz("e1") }
    }

    @Test
    fun `quiz episode ids come from one request and none is sent for an empty list`() = runTest {
        val fake = FakeSupabase { json("""[{"episode_id":"e1"},{"episode_id":"e3"},{"episode_id":"e1"}]""") }
        val c = client(fake)
        assertEquals(setOf("e1", "e3"), c.fetchQuizEpisodeIds(listOf("e1", "e2", "e3")))
        assertEquals("in.(e1,e2,e3)", fake.seen.single().query["episode_id"])
        assertTrue(c.fetchQuizEpisodeIds(emptyList()).isEmpty())
        assertEquals(1, fake.seen.size)
    }
}
