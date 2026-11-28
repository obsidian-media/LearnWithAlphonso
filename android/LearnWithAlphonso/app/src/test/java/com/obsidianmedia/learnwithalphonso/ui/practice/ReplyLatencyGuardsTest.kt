package com.obsidianmedia.learnwithalphonso.ui.practice

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The reply-latency wiring is in a view model the JVM tests do not drive, so this reads the source for what it must keep:
 *  - the latencies go to the recap only for a rehearsal call;
 *  - the clock is the monotonic one, and no wall clock is read anywhere on the latency path;
 *  - a typed reply and a reply with no partner voice clear the clock; a gap is committed only for a transcribed reply.
 */
class ReplyLatencyGuardsTest {
    private fun read(path: String) = File("src/main/java/com/obsidianmedia/learnwithalphonso/$path").readText().replace("\r\n", "\n")
    private val tracker = File("../core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/rehearsal/ReplyLatency.kt").readText().replace("\r\n", "\n")

    private fun problems(vm: String, tracker: String): List<String> {
        val out = mutableListOf<String>()
        if (!Regex("""recap\.start\([^\n]*callSource is CallSource\.Rehearsal\) replyLatency\.values\(\) else emptyList\(\)""").containsMatchIn(vm)) out += "latencies are not limited to rehearsal calls"
        if (!vm.contains("ReplyLatencyTracker { android.os.SystemClock.elapsedRealtime() }")) out += "the tracker is not on the monotonic clock"
        if (vm.lines().any { it.contains("replyLatency") && it.contains("currentTimeMillis") }) out += "a wall clock is read on the latency path"
        if (tracker.contains("currentTimeMillis")) out += "the tracker reads a wall clock"
        if (!Regex("""fun sendText\([^\n]*\n[^\n]*\n\s*replyLatency\.discardPending\(\)""").containsMatchIn(vm)) out += "a typed reply does not clear the clock"
        if (!vm.contains("is TurnEvent.Transcribed -> sendTurn(event.text, event.confidence, spoken = true)")) out += "a transcribed reply is not marked spoken"
        if (!vm.contains("if (spoken) replyLatency.replySent()")) out += "a gap is not committed for a transcribed reply"
        if (!vm.contains("if (chatMode || finishing) { replyLatency.discardPending()")) out += "a reply with no voice does not clear the clock"
        if (!Regex("""catch \(e: Exception\) \{\n\s*if \(callId == attemptId\) \{\n[^\n]*\n\s*replyLatency\.discardPending\(\)""").containsMatchIn(vm)) out += "a failed reply does not clear the clock"
        return out
    }

    @Test fun `the latency wiring keeps its properties`() {
        assertEquals(emptyList<String>(), problems(read("ui/practice/ConversationViewModels.kt"), tracker))
    }

    @Test fun `the guard goes red when each property is removed`() {
        val vm = read("ui/practice/ConversationViewModels.kt")
        assertEquals(1, problems(vm.replace("callSource is CallSource.Rehearsal", "true"), tracker).size)
        // Swapping the clock trips both the monotonic-clock check and the wall-clock check.
        assertEquals(2, problems(vm.replace("android.os.SystemClock.elapsedRealtime()", "System.currentTimeMillis()"), tracker).size)
        assertEquals(1, problems(vm, tracker + "\nval x = System.currentTimeMillis()").size)
        assertEquals(1, problems(vm.replace("replyLatency.discardPending() // typed", "// typed"), tracker).size)
        assertEquals(1, problems(vm.replace("spoken = true)", ")"), tracker).size)
        assertEquals(1, problems(vm.replace("if (spoken) replyLatency.replySent()", "if (spoken) Unit"), tracker).size)
        assertEquals(1, problems(vm.replace("if (chatMode || finishing) { replyLatency.discardPending();", "if (chatMode || finishing) {"), tracker).size)
        assertEquals(1, problems(vm.replace("                replyLatency.discardPending()\n                if (!finishing) handsFree.failed()", "                if (!finishing) handsFree.failed()"), tracker).size)
    }
}
