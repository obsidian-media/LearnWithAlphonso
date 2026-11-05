package com.obsidianmedia.learnwithalphonso.ui.listen

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The podcast quiz's two promises, pinned in the source because the Compose views are not run on the JVM (the Android twin
 * of SaveWordSourceGuardsTest): the client sends only the learner's choices and the finish time, never a score, and the
 * screen shows only what the server returned.
 */
class PodcastQuizSourceGuardsTest {
    private fun read(path: String) = File(path).readText().replace("\r\n", "\n")

    private val client = "../core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/net/PodcastClient.kt"
    private val ui = "src/main/java/com/obsidianmedia/learnwithalphonso/ui/listen/PodcastQuizUi.kt"
    private val listen = "src/main/java/com/obsidianmedia/learnwithalphonso/ui/listen/ListenScreen.kt"

    /** The text of submitQuiz's request body, from `buildJsonObject {` to the call that sends it. */
    private fun submitBody(): String {
        val src = read(client)
        val start = src.indexOf("suspend fun submitQuiz(")
        assertTrue("submitQuiz exists", start >= 0)
        val bodyStart = src.indexOf("val body = buildJsonObject {", start)
        val bodyEnd = src.indexOf("http.function(\"complete-podcast-quiz\", body)", bodyStart)
        assertTrue("the body is built before it is sent", bodyStart in 0 until bodyEnd)
        return src.substring(bodyStart, bodyEnd)
    }

    @Test
    fun `the request carries exactly episodeId, answers and completedAt`() {
        val body = submitBody()
        val keys = Regex("""put\("([A-Za-z]+)"""").findAll(body).map { it.groupValues[1] }.toList()
        assertEquals(listOf("episodeId", "answers", "questionId", "choiceIndex", "completedAt"), keys)
    }

    @Test
    fun `no score, count or XP is ever put in the request`() {
        val body = submitBody()
        for (word in listOf("score", "correct", "xp", "total", "streak", "best", "answerIndex")) {
            assertFalse("the request must not carry '$word'", Regex(word, RegexOption.IGNORE_CASE).containsMatchIn(body))
        }
    }

    @Test
    fun `the answers come from the learner's choices, and the endpoint is the grading function`() {
        val src = read(client)
        assertTrue(src.contains("answers.forEach { add(buildJsonObject { put(\"questionId\", it.questionId); put(\"choiceIndex\", it.choiceIndex) }) }"))
        assertEquals(1, Regex(""""complete-podcast-quiz"""").findAll(src).count())
    }

    @Test
    fun `the screen shows the server's score and XP and computes none`() {
        val src = read(ui)
        assertTrue(src.contains("\"\${result.correct} of \${result.total} correct\""))
        assertTrue(src.contains("PodcastQuizCopy.xpLine(result)"))
        // Nothing here tallies answers: no counting, summing or comparing a pick with the answer except to draw a verdict.
        for (banned in listOf(".count {", ".count(", "sumOf", "xpGain +", "* 10", "correctCount", "Score(")) {
            assertFalse("the quiz UI must not compute '$banned'", src.contains(banned))
        }
        assertEquals("the only comparison with answerIndex is the verdict mark", 2, Regex("""index [=!]= question\.answerIndex""").findAll(src).count())
    }

    @Test
    fun `leaving the sheet cannot cancel a submit`() {
        val src = read(ui)
        assertTrue(src.contains("scope = container.appLifetimeScope"))
        val sheet = src.substring(src.indexOf("fun PodcastQuizSheet("), src.indexOf("private fun QuestionView("))
        assertFalse("the sheet must not run the submit in its own composition scope", sheet.contains("rememberCoroutineScope"))
    }

    @Test
    fun `Try again is offered only for a retryable error`() {
        val src = read(ui)
        assertTrue(Regex("""if \(error\.isRetryable\) \{\n\s+Button\(onClick = onRetry""").containsMatchIn(src))
        assertEquals(1, Regex("""Try again""").findAll(src).count())
    }

    @Test
    fun `a verdict is a visible mark and a word, not colour alone`() {
        val src = read(ui)
        assertTrue(src.contains("right -> \"✓ \${PodcastQuizCopy.CORRECT_LABEL}\""))
        assertTrue(src.contains("wrong -> \"✕ \${PodcastQuizCopy.WRONG_LABEL}\""))
        // Announced once (the merged visible text), as a radio option.
        assertFalse(src.contains("stateDescription"))
        assertTrue(src.contains("role = Role.RadioButton"))
    }

    @Test
    fun `the quiz is offered when the player finishes and from rows that have one`() {
        val listenSrc = read(listen)
        assertTrue(listenSrc.contains("PodcastQuizOfferRow(container, episode, finished = state.phase == PodcastPlayerPhase.Finished)"))
        assertTrue(listenSrc.contains("hasQuiz = episode.id in state.quizEpisodeIds"))
        assertTrue(listenSrc.contains("if (hasQuiz) PodcastQuizRowButton(container, episode)"))
    }

    @Test
    fun `an open quiz sheet does not depend on the player staying finished`() {
        val src = read(ui)
        val offerRow = src.substring(src.indexOf("fun PodcastQuizOfferRow("))
        assertTrue(offerRow.contains("var sheet by remember { mutableStateOf<OpenQuiz?>(null) }"))
        assertFalse("no early return before the sheet", offerRow.contains("?: return"))
    }

    @Test
    fun `the best label follows a better run`() {
        val src = read(ui)
        assertEquals(2, Regex("""PodcastQuizBest\(r\.bestCorrect, r\.bestXp\)""").findAll(src).count())
    }

    @Test
    fun `the whole choice card is the tap target, not only its text`() {
        // iOS froze at question 3 of "Ordering Coffee": its short choices left the middle of each card dead. Here the
        // selectable sits on the full-width card itself, never on the Text inside it.
        val src = read(ui)
        val question = src.substring(src.indexOf("private fun QuestionView("), src.indexOf("private fun ErrorView("))
        assertTrue(
            Regex("""modifier = Modifier\.fillMaxWidth\(\)\.heightIn\(min = 48\.dp\)\s*\.selectable\(selected = picked""").containsMatchIn(question),
        )
        assertEquals(1, Regex("""\.selectable\(""").findAll(question).count())
        assertFalse(question.contains("Text(text, style = MaterialTheme.typography.bodyLarge, color = palette.ink, modifier"))
    }

    @Test
    fun `the row button is an opaque chip with ink words, not a transparent outline on the photo`() {
        val src = read(ui)
        val row = src.substring(src.indexOf("fun PodcastQuizRowButton("), src.indexOf("fun PodcastQuizOfferRow("))
        assertTrue(row.contains("AlphonsoSecondaryButton("))
        assertFalse(row.contains("OutlinedButton("))
        val components = read("src/main/java/com/obsidianmedia/learnwithalphonso/ui/components/AlphonsoComponents.kt")
        val secondary = components.substring(components.indexOf("fun AlphonsoSecondaryButton("), components.indexOf("fun AlphonsoSectionHeader("))
        assertTrue(secondary.contains("colors = ButtonDefaults.outlinedButtonColors(containerColor = p.parchment, contentColor = p.ink)"))
    }
}
