package com.obsidianmedia.learnwithalphonso.ui.lesson

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Lesson order (#688): the server refuses a lesson the learner has not unlocked. The Compose screens are not run on the
 * JVM, so these read the Kotlin source (the Android twin of src/lib/ios-lesson-locked-guards.test.ts):
 *  - the lesson screen shows "Finish the earlier lessons first" INSTEAD of the lesson (and its hearts gate), with a way
 *    back to Learn;
 *  - Learn's course-wide "Continue" reads the units in learning order, as the server opens them.
 */
class LessonLockedSourceGuardsTest {
    private val root = File("src/main/java/com/obsidianmedia/learnwithalphonso/ui")

    private fun read(path: String) = File(root, path).readText().replace("\r\n", "\n")

    private fun lessonProblems(screen: String): List<String> {
        val out = mutableListOf<String>()
        if (!screen.contains("val onStage = !locked && gate == null")) out += "the locked screen is drawn on the stage, not instead of it"
        val branch = screen.substringAfter("if (locked) {", "").substringBefore("} else if (gate != null) {", "")
        if (!branch.contains("LessonLockedContent(onBack = onExit)")) out += "a locked lesson does not show the locked screen first, with a way back"
        val content = screen.substringAfter("internal fun LessonLockedContent(", "").substringBefore("\n}\n", "")
        for (part in listOf("LessonLockedCopy.TITLE", "LessonLockedCopy.MESSAGE", "LessonLockedCopy.BACK_TITLE", "onBack")) {
            if (!content.contains(part)) out += "the locked screen lacks $part"
        }
        return out
    }

    private fun learnProblems(learn: String): List<String> {
        val units = learn.substringAfter("val courseUnits = ", "").substringBefore("val completedSet", "")
        return if (units.contains("LearnFold.inLearningOrder(")) emptyList() else listOf("Continue reads the course in raw curriculum order")
    }

    @Test
    fun `a locked lesson is replaced by the locked screen, and Continue reads the course in learning order`() {
        assertEquals(emptyList<String>(), lessonProblems(read("lesson/LessonScreen.kt")))
        assertEquals(emptyList<String>(), learnProblems(read("learn/LearnScreen.kt")))
    }

    @Test
    fun `the checks go red when each fix is taken out`() {
        val screen = read("lesson/LessonScreen.kt")
        val noBranch = screen.replace("LessonLockedContent(onBack = onExit)", "Unit")
        assertTrue(noBranch != screen)
        assertTrue(lessonProblems(noBranch).contains("a locked lesson does not show the locked screen first, with a way back"))
        val onStage = screen.replace("val onStage = !locked && gate == null", "val onStage = gate == null")
        assertTrue(onStage != screen)
        assertTrue(lessonProblems(onStage).contains("the locked screen is drawn on the stage, not instead of it"))
        val learn = read("learn/LearnScreen.kt")
        val raw = learn.replace(Regex("""LearnFold\.inLearningOrder\(container\.content\.bundle\(state\.course\)\.units\) \{ it\.level \}"""), "container.content.bundle(state.course).units")
        assertTrue(raw != learn)
        assertEquals(listOf("Continue reads the course in raw curriculum order"), learnProblems(raw))
    }
}
