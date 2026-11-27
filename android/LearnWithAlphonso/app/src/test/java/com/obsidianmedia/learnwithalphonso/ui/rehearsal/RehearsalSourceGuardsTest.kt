package com.obsidianmedia.learnwithalphonso.ui.rehearsal

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The Rehearsal screens are Compose, which the JVM tests do not run, so these read the Kotlin source for the properties
 * a rehearsal must keep. Each is proved to go red when its fix is removed (see the pull request).
 *  - a rehearsal call asks the server with the rehearsal source (id and stage), never a prompt of its own;
 *  - the call header labels the tutor as an AI;
 *  - the Pro screen from the rehearsal entry carries the rehearsal_entry paywall source;
 *  - nothing in a rehearsal screen draws stars or a score.
 */
class RehearsalSourceGuardsTest {
    private val root = File("src/main/java/com/obsidianmedia/learnwithalphonso/ui")
    private fun read(path: String) = File(root, path).readText().replace("\r\n", "\n")

    private fun problems(conversation: String, call: String, header: String, rootScreen: String, screens: String): List<String> {
        val out = mutableListOf<String>()
        if (!conversation.contains("callSource)")) out += "the shared conversation does not pass its call source to the chat request"
        if (!call.contains("override val callSource: CallSource get() = CallSource.Rehearsal(rehearsalId, stage)")) out += "the rehearsal call does not use the rehearsal source"
        if (!call.contains("override fun systemPrompt(): String = \"\"")) out += "the rehearsal call holds prompt text"
        if (!header.contains("RehearsalCopy.AI_LABEL")) out += "the rehearsal call header has no AI label"
        if (!rootScreen.contains("PaywallSource.REHEARSAL_ENTRY")) out += "the Pro screen opened from the rehearsal entry has no rehearsal_entry source"
        if (Regex("(?i)\\bstars?\\b").containsMatchIn(screens.replace(Regex("(?s)/\\*.*?\\*/"), "").lines().filterNot { it.trimStart().startsWith("*") || it.trimStart().startsWith("//") }.joinToString("\n"))) out += "a rehearsal screen draws stars"
        return out
    }

    private fun current() = problems(
        read("practice/ConversationViewModels.kt"), read("rehearsal/RehearsalCall.kt"), read("practice/call/PracticeCallScreen.kt"),
        read("RootScreen.kt"), read("rehearsal/RehearsalScreens.kt") + read("rehearsal/RehearsalCall.kt"),
    )

    @Test fun `a rehearsal call, its header, its Pro screen and its debrief keep their properties`() {
        assertEquals(emptyList<String>(), current())
    }

    @Test fun `the guard goes red when each property is removed`() {
        val conv = read("practice/ConversationViewModels.kt")
        val call = read("rehearsal/RehearsalCall.kt")
        val header = read("practice/call/PracticeCallScreen.kt")
        val rootScreen = read("RootScreen.kt")
        val screens = read("rehearsal/RehearsalScreens.kt") + call
        assertEquals(1, problems(conv.replace("callSource)", "null)"), call, header, rootScreen, screens).size)
        assertEquals(1, problems(conv, call.replace("CallSource.Rehearsal(rehearsalId, stage)", "CallSource.Scenario"), header, rootScreen, screens).size)
        assertEquals(1, problems(conv, call.replace("override fun systemPrompt(): String = \"\"", "override fun systemPrompt(): String = \"You are an interviewer\""), header, rootScreen, screens).size)
        assertEquals(1, problems(conv, call, header.replace("RehearsalCopy.AI_LABEL", "\"\""), rootScreen, screens).size)
        assertEquals(1, problems(conv, call, header, rootScreen.replace("PaywallSource.REHEARSAL_ENTRY", "PaywallSource.HECTOR_TAB"), screens).size)
        assertEquals(1, problems(conv, call, header, rootScreen, screens + "\nText(\"3 stars\")").size)
    }
}
