package com.obsidianmedia.learnwithalphonso.ui.listen

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The branching-story promises, pinned in the source because the Compose views are not run on the JVM: the finished path
 * goes to the finish-branching-story Edge Function (never the service-role RPC), carries only the chosen option indexes, and
 * the ending screen shows what the server returned.
 */
class BranchingSourceGuardsTest {
    private fun read(path: String) = File(path).readText().replace("\r\n", "\n")

    private val client = "../core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/net/StoriesClient.kt"
    private val ui = "src/main/java/com/obsidianmedia/learnwithalphonso/ui/listen/BranchingStoryUi.kt"
    private val stories = "src/main/java/com/obsidianmedia/learnwithalphonso/ui/listen/StoriesUi.kt"

    /** Code only: comments may say what is forbidden. */
    private fun code(text: String) = text.lines().filterNot { it.trim().startsWith("//") || it.trim().startsWith("*") || it.trim().startsWith("/*") }.joinToString("\n")

    private fun finishBody(): String {
        val src = code(read(client))
        val start = src.indexOf("suspend fun finishBranching(")
        assertTrue("finishBranching exists", start >= 0)
        val bodyStart = src.indexOf("val body = buildJsonObject {", start)
        val bodyEnd = src.indexOf("http.function(BRANCHING_FUNCTION, body)", bodyStart)
        assertTrue("the body is built before it is sent", bodyStart in 0 until bodyEnd)
        return src.substring(bodyStart, bodyEnd)
    }

    @Test
    fun `the request carries exactly storyId and the path`() {
        val keys = Regex("""put\("([A-Za-z]+)"""").findAll(finishBody()).map { it.groupValues[1] }.toList()
        assertEquals(listOf("storyId", "path"), keys)
    }

    @Test
    fun `no ending, score, credit or user id is ever put in the request`() {
        val body = finishBody()
        for (word in listOf("ending", "score", "star", "credit", "xp", "quality", "user")) {
            assertFalse("the request must not carry '$word'", Regex(word, RegexOption.IGNORE_CASE).containsMatchIn(body))
        }
    }

    @Test
    fun `the path goes to the Edge Function and the service-role rpc is never called from the client`() {
        val src = code(read(client))
        assertTrue(src.contains("const val BRANCHING_FUNCTION = \"finish-branching-story\""))
        assertEquals(1, Regex(""""finish-branching-story"""").findAll(src).count())
        assertFalse(src.contains("finish_branching_story"))
        assertFalse(code(read(ui)).contains("finish_branching_story"))
    }

    @Test
    fun `the ending screen asks the server and shows its answer`() {
        val src = code(read(ui))
        assertTrue(src.contains("container.storiesClient.finishBranching(story.id, path)"))
        assertTrue(src.contains("Branching.stars(finish.endingsFound.size, finish.endingsTotal"))
    }

    @Test
    fun `the story reader opens branching stories`() {
        val src = code(read(stories))
        assertTrue(src.contains("fetchBranchingStory(storyId)"))
        assertTrue(src.contains("BranchingStoryReader(container, current.story)"))
    }
}
