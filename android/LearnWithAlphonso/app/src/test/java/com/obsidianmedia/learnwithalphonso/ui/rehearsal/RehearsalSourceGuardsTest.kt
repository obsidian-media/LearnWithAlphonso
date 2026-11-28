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

    // ---- the quick-start picker: the server owns every preset word; "Something else" is the existing intake; Personalise is create then adjust

    private val coreFile = File("../core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/rehearsal/Rehearsals.kt")
    private val presetIds = listOf("job_interview", "talk_to_manager", "doctor_appointment", "apartment_landlord", "bank_account", "parent_teacher", "first_day", "customer_service_call")

    private fun presetProblems(presetScreens: String, screens: String, core: String): List<String> {
        val out = mutableListOf<String>()
        // first_day is also an event kind of the intake, so the core file is checked without it.
        val hardcoded = presetIds.filter { presetScreens.contains("\"$it\"") || (it != "first_day" && core.contains("\"$it\"")) }
        if (hardcoded.isNotEmpty()) out += "the app hardcodes preset ids $hardcoded (the server owns the presets)"
        if (!presetScreens.contains("PresetCopy.SOMETHING_ELSE") || !presetScreens.contains("onClick = onSomethingElse")) out += "the picker has no Something else card"
        if (!screens.contains("onSomethingElse = { c.clearError(); screen = \"intake\" }")) out += "Something else does not open the existing intake"
        if (!screens.contains("onPersonalise = { screen = \"adjust\" }")) out += "Personalise does not open the existing adjust flow"
        if (!presetScreens.contains("controller.createFromPreset(preset.id, date)")) out += "the preview does not create from the preset id and the optional date"
        if (!presetScreens.contains("PresetCopy.RETRY")) out += "a failed preset list has no retry"
        return out
    }

    private fun presetCurrent() = presetProblems(read("rehearsal/RehearsalPresetScreens.kt"), read("rehearsal/RehearsalScreens.kt"), coreFile.readText().replace("\r\n", "\n"))

    @Test fun `the quick-start picker keeps its properties`() {
        assertEquals(emptyList<String>(), presetCurrent())
    }

    @Test fun `the quick-start guard goes red when each property is removed`() {
        val p = read("rehearsal/RehearsalPresetScreens.kt")
        val s = read("rehearsal/RehearsalScreens.kt")
        val core = coreFile.readText().replace("\r\n", "\n")
        assertEquals(1, presetProblems(p + "\nval x = \"bank_account\"", s, core).size)
        assertEquals(1, presetProblems(p, s, core + "\nval y = \"job_interview\"").size)
        assertEquals(1, presetProblems(p.replace("onClick = onSomethingElse", "onClick = {}"), s, core).size)
        assertEquals(1, presetProblems(p, s.replace("onSomethingElse = { c.clearError(); screen = \"intake\" }", "onSomethingElse = {}"), core).size)
        assertEquals(1, presetProblems(p, s.replace("onPersonalise = { screen = \"adjust\" }", "onPersonalise = {}"), core).size)
        assertEquals(1, presetProblems(p.replace("controller.createFromPreset(preset.id, date)", "false"), s, core).size)
        assertEquals(1, presetProblems(p.replace("PresetCopy.RETRY", "\"\""), s, core).size)
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
