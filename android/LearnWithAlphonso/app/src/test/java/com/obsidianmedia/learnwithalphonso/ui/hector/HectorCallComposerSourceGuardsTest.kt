package com.obsidianmedia.learnwithalphonso.ui.hector

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Hector's call has a type box (owner decision: "Add a type box to the call"). The Compose views are not run on the
 * JVM, so these read the Kotlin source (the Android twin of the guard in src/lib/ios-practice-call-guards.test.ts): the
 * call is given the one shared [HectorComposer] as its sheet footer, and the sheet lifts that footer above the keyboard.
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
        if (!screen.contains("onSend = { val t = draft; draft = \"\"; vm.sendTyped(t) }")) out += "the composer does not send through vm.sendTyped"
        val sheet = call.substringAfter("ModalBottomSheet(")
        if (!sheet.contains("Box(Modifier.imePadding()) { sheetFooter() }")) out += "the sheet does not lift the footer above the keyboard"
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
        val noIme = call.replace("Modifier.imePadding()", "Modifier")
        assertTrue(noIme != call)
        assertTrue(problems(screen, noIme).isNotEmpty())
    }
}
