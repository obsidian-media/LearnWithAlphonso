package com.obsidianmedia.learnwithalphonso.ui.listen

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The graded-stories promises, pinned in the source because the Compose views are not run on the JVM (the twin of
 * PodcastQuizSourceGuardsTest and ios-stories-guards.test.ts): the check is graded on the server through the
 * complete-story-check Edge Function (never the service-role RPC from the client), the client sends only the chosen answers,
 * and the screen shows only what the server returned.
 */
class StoriesSourceGuardsTest {
    private fun read(path: String) = File(path).readText().replace("\r\n", "\n")

    private val client = "../core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/net/StoriesClient.kt"
    private val ui = "src/main/java/com/obsidianmedia/learnwithalphonso/ui/listen/StoriesUi.kt"
    private val shelf = "src/main/java/com/obsidianmedia/learnwithalphonso/ui/listen/ListenShelfUi.kt"
    private val quiz = "src/main/java/com/obsidianmedia/learnwithalphonso/ui/listen/PodcastQuizUi.kt"

    /** Code only: comments may say what is forbidden. */
    private fun code(text: String) = text.lines().filterNot { it.trim().startsWith("//") || it.trim().startsWith("*") || it.trim().startsWith("/*") }.joinToString("\n")

    private fun submitBody(): String {
        val src = code(read(client))
        val start = src.indexOf("suspend fun submitCheck(")
        assertTrue("submitCheck exists", start >= 0)
        val bodyStart = src.indexOf("val body = buildJsonObject {", start)
        val bodyEnd = src.indexOf("http.function(CHECK_FUNCTION, body)", bodyStart)
        assertTrue("the body is built before it is sent", bodyStart in 0 until bodyEnd)
        return src.substring(bodyStart, bodyEnd)
    }

    @Test
    fun `the request carries exactly storyId and the chosen answers`() {
        val keys = Regex("""put\("([A-Za-z]+)"""").findAll(submitBody()).map { it.groupValues[1] }.toList()
        assertEquals(listOf("storyId", "answers", "questionId", "choiceIndex"), keys)
    }

    @Test
    fun `no score, count, XP or user id is ever put in the request`() {
        val body = submitBody()
        for (word in listOf("score", "correct", "xp", "total", "streak", "best", "answerIndex", "user")) {
            assertFalse("the request must not carry '$word'", Regex(word, RegexOption.IGNORE_CASE).containsMatchIn(body))
        }
    }

    @Test
    fun `the check goes to the grading Edge Function and the service-role rpc is never called from the client`() {
        val src = code(read(client))
        assertTrue(src.contains("const val CHECK_FUNCTION = \"complete-story-check\""))
        assertEquals(1, Regex(""""complete-story-check"""").findAll(src).count())
        assertFalse(src.contains("submit_story_check"))
        assertFalse(code(read(ui)).contains("submit_story_check"))
    }

    @Test
    fun `progress is written only through the save_story_progress rpc`() {
        val src = code(read(client))
        assertTrue(src.contains("http.rpc(\"save_story_progress\""))
        // The table has no client write grant: nothing posts or patches story_progress itself.
        assertFalse(Regex("""HttpMethod\.(Post|Patch|Put),\s*"story_progress"""").containsMatchIn(src))
        assertTrue(src.contains("\"published\" to \"eq.true\""))
    }

    @Test
    fun `the check sheet is the shared quiz run with the story's own sender and no XP line`() {
        val src = code(read(ui))
        assertTrue(src.contains("submit = { answers, _ -> container.storiesClient.submitCheck(story.id, answers) }"))
        assertTrue(src.contains("resultNote = { StoryCopy.COUNTS_LINE }"))
        // The score on screen is the server's: nothing here counts right answers.
        for (banned in listOf(".count {", ".count(", "sumOf", "xpGain", "answerIndex")) {
            assertFalse("the stories UI must not compute '$banned'", src.contains(banned))
        }
    }

    @Test
    fun `the podcast quiz keeps its own sender and XP line by default`() {
        val src = read(quiz)
        assertTrue(src.contains("submit = submit ?: { answers, finishedAt -> container.podcastClient.submitQuiz(episodeId, answers, finishedAt) }"))
        assertTrue(src.contains("resultNote?.invoke(result) ?: PodcastQuizCopy.xpLine(result)"))
    }

    @Test
    fun `narration uses the existing tts client and the core narration rules, and a tapped word opens the save sheet`() {
        val src = code(read(ui))
        assertTrue(src.contains("container.aiClient.synthesizeSpeech("))
        assertTrue(src.contains("Stories.nextSegment("))
        assertTrue(src.contains("finishedCurrent()"))
        assertTrue(src.contains("TappableText("))
        assertTrue(src.contains("SaveWordMode.AllWords"))
        assertTrue(src.contains("SaveWordHost(container)"))
    }

    @Test
    fun `a recording that will not play falls back to live speech through the core consent rule`() {
        val src = code(read(ui))
        val play = src.substring(src.indexOf("fun play(index: Int"), src.indexOf("fun stop()"))
        val first = play.indexOf("playback.play(audio.bytes) ||")
        val rule = play.indexOf("StoryRecordings.speakLiveAfterPlayFailure(audio.recorded, liveSpeechAllowed) &&")
        val live = play.indexOf("audioFor(current, live = true)")
        assertTrue("the recording plays, then the rule, then the live retry", first in 0 until rule && rule < live)
        val audioFor = src.substring(src.indexOf("private fun audioFor("))
        assertTrue(audioFor.contains("if (!live) {"))
        assertTrue(audioFor.contains("NarrationAudio(it, recorded = true)"))
        assertTrue(audioFor.contains("recorded = false"))
    }

    @Test
    fun `narration plays the recording first, falls back to live speech only with consent, and both readers use begin`() {
        val src = code(read(ui))
        val audioFor = src.substring(src.indexOf("private fun audioFor("))
        val recorded = audioFor.indexOf("container.storyRecordings.audio(")
        val gate = audioFor.indexOf("check(liveSpeechAllowed)")
        val live = audioFor.indexOf("container.aiClient.synthesizeSpeech(")
        assertTrue("the recording is tried before the gate and the live voice", recorded in 0 until gate && gate < live)
        assertTrue(src.contains("StoryRecordings.canNarrate(story.segments, recordings, aiConsentGranted)"))
        assertTrue(src.contains("narrator.begin(from, hasAiConsent)"))
        assertTrue(code(read(ui.replace("StoriesUi", "BranchingStoryUi"))).contains("narrator.begin(0, hasAiConsent)"))
    }

    @Test
    fun `the Library reaches stories through its All peek and its Stories tab`() {
        assertTrue(code(read(shelf)).contains("StoriesPeekSection(stories, course, onOpenStory)"))
        assertTrue(code(read(shelf)).contains("LibraryTab.Stories -> storiesFullItems(stories, course, onOpenStory)"))
    }

    @Test
    fun `the Library All tab has a Podcasts rail between Continue and Watch, and the course is a compact chip`() {
        val src = code(read(shelf))
        val rail = src.indexOf("PodcastsRailSection(shelves, onOpenFolder)")
        assertTrue("the rail is drawn on All", rail > 0)
        assertTrue("the rail comes before the Watch rail", rail < src.indexOf("item(key = \"watch\")"))
        assertTrue("See all jumps to the Listen tab", src.contains("PodcastsRailSection(shelves, onOpenFolder) { select(LibraryTab.Listen) }"))
        assertTrue(src.contains("CourseChip(course) { course = it }"))
        assertFalse("the full-width course control is gone", src.contains("DsSegmented("))
    }
}
