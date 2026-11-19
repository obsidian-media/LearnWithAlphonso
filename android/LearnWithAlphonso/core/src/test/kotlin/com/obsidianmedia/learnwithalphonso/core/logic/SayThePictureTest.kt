package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Lesson
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.content.Unit
import com.obsidianmedia.learnwithalphonso.core.content.VocabImageRef
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.random.Random

class SayThePictureTest {
    private val base = "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/"
    private fun image(name: String) = VocabImageRef(url = "$base$name.jpg", alt = name, credit = "c")
    private fun unit(vararg answers: String): Unit {
        val questions = answers.mapIndexed { i, a -> Question.FillInBlank("q$i", "I see a ___.", listOf(a), a, "x") }
        return Unit("u1", "A1", "e", "t", "d", listOf(Lesson("l1", "t", "s", questions)))
    }
    private fun words(n: Int) = (0 until n).map { SayThePicture.PictureWord("word$it", image("w$it")) }

    // ---- live pool ----

    @Test
    fun `the pool keeps only words that have a picture`() {
        val pool = SayThePicture.pool(listOf(unit("dog", "cat", "idea")), mapOf("dog" to image("dog"), "cat" to image("cat")))
        assertEquals(listOf("dog", "cat"), pool.map { it.term })
    }

    @Test
    fun `a newly image-tagged word appears in the pool on the next call`() {
        val u = listOf(unit("dog", "cat", "idea"))
        val images = mutableMapOf("dog" to image("dog"))
        assertEquals(listOf("dog"), SayThePicture.pool(u, images).map { it.term })
        images["idea"] = image("idea") // a new photo batch lands
        assertEquals(listOf("dog", "idea"), SayThePicture.pool(u, images).map { it.term })
    }

    @Test
    fun `an image from another host is not in the pool and terms dedupe ignoring case`() {
        val foreign = VocabImageRef("https://pixabay.com/get/x.jpg", "a", "c")
        assertTrue(SayThePicture.pool(listOf(unit("dog")), mapOf("dog" to foreign)).isEmpty())
        assertEquals(1, SayThePicture.pool(listOf(unit("Dog", "dog")), mapOf("dog" to image("dog"))).size)
    }

    @Test
    fun `the real bundled content yields a pool for every course that is more than a session`() {
        val store = com.obsidianmedia.learnwithalphonso.core.content.ContentStore { name -> checkNotNull(javaClass.getResourceAsStream("/$name")).bufferedReader().readText() }
        for (course in Course.entries) {
            val pool = SayThePicture.pool(store.bundle(course).units, store.vocabImages)
            // Not a magic number: the pool is whatever has a picture today, and a session needs only the floor.
            assertTrue(pool.size >= SayThePicture.MIN_POOL, "${course.code} pool ${pool.size}")
        }
    }

    // ---- rounds ----

    @Test
    fun `a draw is eight distinct words of a larger pool and the whole of a smaller one`() {
        val drawn = SayThePicture.draw(words(20), random = Random(1))
        assertEquals(8, drawn.size)
        assertEquals(8, drawn.map { it.term }.toSet().size)
        assertEquals(5, SayThePicture.draw(words(5)).size)
    }

    // ---- forgiving grade ----

    @Test
    fun `saying the word, or it inside a phrase, is a hit`() {
        assertTrue(SayThePicture.said("Dog.", "dog", Course.ENGLISH))
        assertTrue(SayThePicture.said("a dog", "dog", Course.ENGLISH))
        assertTrue(SayThePicture.said("el abogado", "abogado", Course.SPANISH))
    }

    @Test
    fun `another word, silence and a substring are misses`() {
        assertFalse(SayThePicture.said("cat", "dog", Course.ENGLISH))
        assertFalse(SayThePicture.said("", "dog", Course.ENGLISH))
        assertFalse(SayThePicture.said("hotdog", "dog", Course.ENGLISH))
    }

    @Test
    fun `stars are by share and never below one`() {
        assertEquals(3, SayThePicture.stars(8, 8))
        assertEquals(3, SayThePicture.stars(6, 8))
        assertEquals(2, SayThePicture.stars(4, 8))
        assertEquals(1, SayThePicture.stars(0, 8))
        assertEquals(1, SayThePicture.stars(0, 0))
    }

    // ---- session flow ----

    @Test
    fun `a correct answer earns the star and next advances`() {
        val (s, outcome) = SayPictureSession(words(8)).submit("word0", Course.ENGLISH)
        assertEquals(SayPictureOutcome.RIGHT, outcome)
        assertEquals(SayPicturePhase.RIGHT, s.phase)
        assertEquals(1, s.firstTry)
        val n = s.next()
        assertEquals(1, n.index)
        assertEquals(SayPicturePhase.ASK, n.phase)
    }

    @Test
    fun `a miss reveals the word, a repeat ends it, and the session goes on unscored`() {
        val (miss, o1) = SayPictureSession(words(8)).submit("banana", Course.ENGLISH)
        assertEquals(SayPictureOutcome.REVEAL, o1)
        assertEquals(SayPicturePhase.REVEAL, miss.phase)
        assertEquals(0, miss.firstTry)
        val (repeated, o2) = miss.submit("anything", Course.ENGLISH)
        assertEquals(SayPictureOutcome.REPEATED, o2)
        assertEquals("anything", repeated.heard)
        assertEquals(0, repeated.firstTry)
        val n = repeated.next()
        assertEquals(1, n.index)
        assertNull(n.heard)
    }

    @Test
    fun `show me the word works with no mic and only while asking`() {
        val s = SayPictureSession(words(8)).showWord()
        assertEquals(SayPicturePhase.REVEAL, s.phase)
        assertEquals(s, s.showWord())
        assertEquals(SayPicturePhase.ASK, s.next().phase)
    }

    @Test
    fun `silence is not a miss`() {
        val (s, o) = SayPictureSession(words(8)).submit("  ", Course.ENGLISH)
        assertEquals(SayPictureOutcome.UNHEARD, o)
        assertEquals(SayPicturePhase.ASK, s.phase)
    }

    @Test
    fun `eight rounds then done with the stars`() {
        var s = SayPictureSession(words(8))
        for (i in 0 until 8) {
            assertEquals(i, s.index)
            assertEquals(SayPicturePhase.ASK, s.phase)
            s = if (i < 6) s.submit("word$i", Course.ENGLISH).first else s.showWord()
            if (i == 7) assertEquals("Finish", s.nextWordLabel)
            s = s.next()
        }
        assertEquals(SayPicturePhase.DONE, s.phase)
        assertEquals(6, s.firstTry)
        assertEquals(3, s.stars)
    }

    @Test
    fun `a finished session ignores further input`() {
        val done = SayPictureSession(words(1)).submit("word0", Course.ENGLISH).first.next()
        assertEquals(SayPicturePhase.DONE, done.phase)
        val (again, o) = done.submit("word0", Course.ENGLISH)
        assertEquals(SayPictureOutcome.UNHEARD, o)
        assertEquals(1, again.firstTry)
    }

    @Test
    fun `an empty pool is a done session with nothing to say`() {
        assertEquals(SayPicturePhase.DONE, SayPictureSession(emptyList()).phase)
    }

    // ---- same endpoints: the speaking quota, not a new kind ----

    @Test
    fun `speech goes to the existing stt route with the course and model audio to tts`() = runTest {
        val paths = ArrayList<String>()
        val bodies = ArrayList<String>()
        val engine = MockEngine { req ->
            paths.add(req.url.encodedPath)
            bodies.add(req.body.toByteArray().decodeToString(throwOnInvalidSequence = false))
            if (req.url.encodedPath.endsWith("stt")) respond("""{"text":"perro"}""".toByteArray(), HttpStatusCode.OK)
            else respond(byteArrayOf(1, 2), HttpStatusCode.OK)
        }
        val speech = SayPictureSpeech(AiConversationClient(ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine)))
        assertEquals("perro", speech.transcribe(ByteArray(10), Course.SPANISH))
        speech.modelAudio("perro", null, Course.SPANISH)
        assertEquals(listOf("/api/stt", "/api/tts"), paths)
        assertTrue(bodies[0].contains("name=course") || bodies[0].contains("name=\"course\""))
        assertTrue(bodies[0].contains("es"))
        assertEquals("""{"text":"perro","course":"es"}""", bodies[1])
    }

    // ---- Tier 1 derived state ----

    @Test
    fun `results combo and missed words follow the session`() {
        var s = SayPictureSession(words(5))
        s = s.submit("word0", Course.ENGLISH).first.next()
        s = s.submit("word1", Course.ENGLISH).first
        assertEquals(2, s.combo)
        s = s.next().submit("zzz", Course.ENGLISH).first
        assertEquals(0, s.combo)
        s = s.next().showWord()
        s = s.next().submit("word4", Course.ENGLISH).first
        assertEquals(1, s.combo)
        assertEquals(listOf(SayPictureResult.FIRST, SayPictureResult.FIRST, SayPictureResult.MISSED, SayPictureResult.MISSED, SayPictureResult.FIRST), s.results)
        assertEquals(listOf("word2", "word3"), s.missedWords.map { it.term })
        assertEquals(s.results, s.recap.map { it.second })
        assertEquals(listOf("word0", "word1", "word2", "word3", "word4"), s.recap.map { it.first.term })
    }

    @Test
    fun `silence and the repeat after a reveal add no result`() {
        var s = SayPictureSession(words(4))
        s = s.submit("  ", Course.ENGLISH).first
        assertTrue(s.results.isEmpty())
        s = s.submit("zzz", Course.ENGLISH).first.submit("word0", Course.ENGLISH).first
        assertEquals(listOf(SayPictureResult.MISSED), s.results)
    }

    @Test
    fun `pose follows state`() {
        assertEquals(SayPicturePose.EXPLAINING, SayPicturePose.of(SayPicturePhase.ASK, false))
        assertEquals(SayPicturePose.LISTENING, SayPicturePose.of(SayPicturePhase.ASK, true))
        assertEquals(SayPicturePose.THINKING, SayPicturePose.of(SayPicturePhase.REVEAL, false))
        assertEquals(SayPicturePose.CHEER, SayPicturePose.of(SayPicturePhase.RIGHT, false))
        assertEquals(
            listOf("poses/alphonso-explaining-pointer.webp", "poses/alphonso-levelup-cheer.webp", "poses/alphonso-listening-headphones.webp", "poses/alphonso-thinking-temple.webp"),
            SayPicturePose.values().map { it.asset }.sorted(),
        )
    }

    @Test
    fun `only single words are savable to the review deck`() {
        assertTrue(SayThePicture.isSavable("perro"))
        assertTrue(SayThePicture.isSavable("l'eau"))
        assertTrue(SayThePicture.isSavable("a\u00f1o"))
        assertFalse(SayThePicture.isSavable("ice cream"))
        assertFalse(SayThePicture.isSavable(""))
        assertEquals("dog", SayThePicture.PictureWord("dog", image("dog")).toVocabItem().term)
    }
}
