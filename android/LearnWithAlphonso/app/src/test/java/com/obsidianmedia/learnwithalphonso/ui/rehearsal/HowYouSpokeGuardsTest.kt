package com.obsidianmedia.learnwithalphonso.ui.rehearsal

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The "How you spoke" card is Compose, which the JVM tests do not run, so this reads the source for what it must keep:
 *  - the debrief draws the card;
 *  - the card draws each sentence from the shared rules (so TalkBack and the screen agree) and hides the trend marks from TalkBack;
 *  - a worse number is never drawn in the wrong (red) colours, and no percentage or grade is drawn.
 */
class HowYouSpokeGuardsTest {
    private val root = File("src/main/java/com/obsidianmedia/learnwithalphonso/ui/rehearsal")
    private fun read(name: String) = File(root, name).readText().replace("\r\n", "\n")

    private fun problems(debrief: String, card: String): List<String> {
        val out = mutableListOf<String>()
        if (!debrief.contains("HowYouSpokeCard(rehearsalSpeaking, courseCode)")) out += "the debrief does not draw the How you spoke card"
        if (!card.contains("SpeakingRules.sentence(")) out += "the card does not use the shared sentence"
        if (!card.contains("clearAndSetSemantics")) out += "the trend marks are not hidden from TalkBack"
        if (Regex("wrong|heart|danger|Color\\.Red|%").containsMatchIn(card.lines().filterNot { it.trimStart().startsWith("*") || it.trimStart().startsWith("/*") || it.trimStart().startsWith("//") }.joinToString("\n"))) out += "the card draws a red or percentage"
        return out
    }

    @Test fun `the debrief and its speaking card keep their properties`() {
        assertEquals(emptyList<String>(), problems(read("RehearsalCall.kt"), read("HowYouSpokeCard.kt")))
    }

    @Test fun `the guard goes red when each property is removed`() {
        val d = read("RehearsalCall.kt")
        val c = read("HowYouSpokeCard.kt")
        assertEquals(1, problems(d.replace("HowYouSpokeCard(rehearsalSpeaking, courseCode)", ""), c).size)
        assertEquals(1, problems(d, c.replace("SpeakingRules.sentence(", "String.format(")).size)
        assertEquals(1, problems(d, c.replace("clearAndSetSemantics", "semantics")).size)
        assertEquals(1, problems(d, c.replace("ds.sunk", "ds.wrongTint")).size)
    }
}
