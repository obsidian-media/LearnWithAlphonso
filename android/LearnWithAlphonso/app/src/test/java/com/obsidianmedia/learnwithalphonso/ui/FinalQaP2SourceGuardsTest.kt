package com.obsidianmedia.learnwithalphonso.ui

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Final QA P2 polish (2026-11-21), the Android twins of src/lib/ios-final-qa-p2-guards.test.ts. The Compose views are
 * not run on the JVM, so these read the Kotlin source, and each check is proved to go red when its fix is removed:
 *  - Say it right and Say the picture draw their bubble with [SpeechBubbleShape], a tail toward Alphonso;
 *  - the story reader's scrim is dark by the first paragraph, and its eyebrow and text carry a shadow;
 *  - first-run "Skip" is the brand ink, not the white card colour.
 * Not guarded because Android was already right: Say it right's buttons are stacked full-width (they wrap by word at any
 * font scale), and LessonComplete scrolls ABOVE its CTA (a Column weight(1f) over the button), so nothing sits under it.
 */
class FinalQaP2SourceGuardsTest {
    private val root = File("src/main/java/com/obsidianmedia/learnwithalphonso/ui")

    private fun read(path: String) = File(root, path).readText().replace("\r\n", "\n")

    private fun tailProblems(shape: String, pronunciation: String, picture: String): List<String> {
        val out = mutableListOf<String>()
        if (!shape.contains("moveTo(tailW + 1f, midY - tailH / 2)") || !shape.contains("lineTo(0f, midY)")) out += "the shape's tail does not point out the leading edge"
        if (!shape.contains("Path.combine(PathOperation.Union, body, tail)")) out += "the tail is not unioned into one outline"
        if (!pronunciation.contains(".background(ds.card, bubbleShape)") || !pronunciation.contains(".border(1.5.dp, ds.line, bubbleShape)")) out += "Say it right's bubble is not drawn with the tail shape"
        if (!pronunciation.contains("bubbleShape.tailWidth")) out += "Say it right's bubble reserves no room for the tail"
        if (!picture.contains(".background(Color.White, SpeechBubbleShape(16.dp))") || !picture.contains("tailWidth")) out += "Say the picture's bubble is not drawn with the tail shape"
        return out
    }

    private fun readerProblems(story: String): List<String> {
        val out = mutableListOf<String>()
        // Dark by 44 % down (where the first paragraph starts): at least 0.7.
        val at44 = Regex("""0\.44f to dark\.copy\(alpha = ([\d.]+)f\)""").find(story)?.groupValues?.get(1)?.toFloat() ?: 0f
        if (at44 < 0.7f) out += "the scrim is only $at44 dark at 44 % down"
        val eyebrow = story.lineSequence().firstOrNull { it.contains("\"Scene ${'$'}sceneNumber\".uppercase()") }.orEmpty()
        if (!eyebrow.contains("readerShadow(")) out += "the Scene N eyebrow has no text shadow"
        if (story.lines().count { it.contains("style = BodyType.copy(shadow = readerShadow(") } < 2) out += "the read-along text has no text shadow"
        return out
    }

    private fun skipProblems(parts: String): List<String> {
        val skip = parts.lineSequence().firstOrNull { it.contains("Text(\"Skip\"") }.orEmpty()
        return if (skip.contains("color = ds.brand") && !skip.contains("ds.card")) emptyList() else listOf("Skip is not the brand ink")
    }

    private val shape = read("components/SpeechBubbleShape.kt")
    private val pronunciation = read("practice/PronunciationScreen.kt")
    private val picture = read("practice/SayThePictureScreen.kt")
    private val story = read("listen/BranchingStoryUi.kt")
    private val parts = read("firstrun/FirstRunParts.kt")

    private fun mutate(text: String, from: String, to: String): String {
        val next = text.replace(from, to)
        assertTrue("mutation target missing: $from", next != text)
        return next
    }

    @Test fun `both speech bubbles have a tail toward Alphonso`() = assertEquals(emptyList<String>(), tailProblems(shape, pronunciation, picture))

    @Test fun `the story reader keeps the first paragraph readable over bright art`() = assertEquals(emptyList<String>(), readerProblems(story))

    @Test fun `first-run Skip is readable on cream`() = assertEquals(emptyList<String>(), skipProblems(parts))

    @Test fun `the checks go red when each fix is taken out`() {
        assertTrue(tailProblems(mutate(shape, "lineTo(0f, midY)", "lineTo(size.width, midY)"), pronunciation, picture).isNotEmpty())
        assertTrue(tailProblems(shape, mutate(pronunciation, ".background(ds.card, bubbleShape)", ".background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.bubble))"), picture).isNotEmpty())
        assertTrue(tailProblems(shape, pronunciation, mutate(picture, ".background(Color.White, SpeechBubbleShape(16.dp))", ".background(Color.White, RoundedCornerShape(16.dp))")).isNotEmpty())
        assertTrue(readerProblems(mutate(story, "0.44f to dark.copy(alpha = 0.78f)", "0.44f to dark.copy(alpha = 0.30f)")).isNotEmpty())
        assertTrue(readerProblems(mutate(story, "OverlineType.copy(shadow = readerShadow(ds.heroB))", "OverlineType")).isNotEmpty())
        assertTrue(skipProblems(mutate(parts, "Text(\"Skip\", style = HeadlineType, color = ds.brand)", "Text(\"Skip\", style = HeadlineType, color = ds.card)")).isNotEmpty())
    }
}
