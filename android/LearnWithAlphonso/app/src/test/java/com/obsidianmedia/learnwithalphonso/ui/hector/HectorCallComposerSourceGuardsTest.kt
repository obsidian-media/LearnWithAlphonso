package com.obsidianmedia.learnwithalphonso.ui.hector

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Hector's call has a type box (owner decision: "Add a type box to the call"). The Compose views are not run on the
 * JVM, so these read the Kotlin source (the Android twin of the guard in src/lib/ios-practice-call-guards.test.ts): the
 * call is given the one shared [HectorComposer] as its sheet footer, and the sheet keeps material3's own insets (the
 * navigation bar when the keyboard is closed, the keyboard when open), with no second inset that could double the gap.
 */
class HectorCallComposerSourceGuardsTest {
    private val root = File("src/main/java/com/obsidianmedia/learnwithalphonso/ui")

    private fun read(path: String) = File(root, path).readText().replace("\r\n", "\n")

    /** What is wrong with the call's wiring in these two sources; empty when it is right. */
    private fun problems(screen: String, call: String): List<String> {
        val out = mutableListOf<String>()
        val callBlock = screen.substringAfter("PracticeCallScreen(").substringBefore("return@SaveWordHost")
        if (!callBlock.contains("sheetFooter = composer")) out += "the call is not given the composer as its sheet footer"
        if (Regex("""HectorComposer\(""").findAll(screen).count() != 1) out += "HectorComposer is not built exactly once (a fork?)"
        if (!screen.contains("composer()")) out += "the classic screen lost its composer"
        if (!screen.contains("onSend = { draft = submitDraft(draft, vm::sendTyped) }")) out += "the composer does not send through vm.sendTyped"
        // The sheet's code to the end of PracticeCallScreen, comments left out (they may name what is banned).
        val sheet = call.substringAfter("ModalBottomSheet(").substringBefore("\n}\n")
            .lines().filterNot { it.trimStart().startsWith("//") }.joinToString("\n")
        if (!sheet.contains("if (sheetFooter != null) sheetFooter()")) out += "the sheet does not draw the footer"
        // The default contentWindowInsets (safeDrawing, top + bottom) is what lifts the footer clear of both bars.
        if (sheet.contains("contentWindowInsets")) out += "the sheet overrides material3's insets, so the footer can sit under the bars"
        if (Regex("""imePadding|navigationBarsPadding|windowInsetsPadding""").containsMatchIn(sheet)) out += "a second inset in the sheet doubles the gap"
        return out
    }

    @Test
    fun `the call's conversation sheet mounts the shared composer above the keyboard`() {
        val problems = problems(read("hector/HectorScreen.kt"), read("practice/call/PracticeCallScreen.kt"))
        assertEquals(emptyList<String>(), problems)
    }

    @Test
    fun `the check goes red when the composer is taken out of the call`() {
        val screen = read("hector/HectorScreen.kt")
        val call = read("practice/call/PracticeCallScreen.kt")
        val noFooter = screen.replace("sheetFooter = composer,", "")
        assertTrue(noFooter != screen)
        assertTrue(problems(noFooter, call).isNotEmpty())
        val insetsOff = call.replace("ModalBottomSheet(", "ModalBottomSheet(contentWindowInsets = { WindowInsets(0) }, ")
        assertTrue(insetsOff != call)
        assertTrue(problems(screen, insetsOff).isNotEmpty())
        val doubled = call.replace("if (sheetFooter != null) sheetFooter()", "if (sheetFooter != null) Box(Modifier.navigationBarsPadding()) { sheetFooter() }")
        assertTrue(doubled != call)
        assertTrue(problems(screen, doubled).isNotEmpty())
        val draftEaten = screen.replace("draft = submitDraft(draft, vm::sendTyped)", "val t = draft; draft = \"\"; vm.sendTyped(t)")
        assertTrue(draftEaten != screen)
        assertTrue(problems(draftEaten, call).isNotEmpty())
    }
}
