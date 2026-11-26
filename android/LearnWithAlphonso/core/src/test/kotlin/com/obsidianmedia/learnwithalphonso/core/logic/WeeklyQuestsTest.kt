package com.obsidianmedia.learnwithalphonso.core.logic

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WeeklyQuestsTest {
    @Test
    fun `quest ids are the weekly_quests ids, not weekly challenge template ids`() {
        assertTrue(isWeeklyQuestId("weekly_lessons_5"))
        // The ids the Android claim button used to send; claim_weekly_quest answers unknown-quest for these.
        listOf("lessons_5", "xp_300", "t1", "").forEach { assertFalse(isWeeklyQuestId(it), it) }
    }

    @Test
    fun `progress comes from the week's xp and lesson count, and a claimed quest stays claimed`() {
        val q = buildWeeklyQuests(xpThisWeek = 160, lessonsThisWeek = 5, claimedIds = setOf("weekly_lessons_5"))
        assertEquals(listOf(160, 160, 5), q.map { it.progress })
        assertEquals(listOf(true, false, false), q.map { it.claimable })
        assertEquals(listOf(false, false, true), q.map { it.claimed })
    }

    @Test
    fun `every refusal the RPC gives has its own line, and none of them is a connection error`() {
        listOf("not-yet-completed", "already-claimed", "invalid-week", "no-course-progress", "unknown-quest", null).forEach {
            assertFalse(weeklyQuestClaimMessage(it).contains("connection"))
        }
        assertEquals("You already claimed this one.", weeklyQuestClaimMessage("already-claimed"))
    }

    @Test
    fun `the catalogue matches the weekly_quests seed migration`() {
        // Gradle runs from the module dir (android/LearnWithAlphonso/core); the repo root is three levels up.
        var dir: File? = File("").absoluteFile
        while (dir != null && !File(dir, "supabase/migrations").isDirectory) dir = dir.parentFile
        val sql = File(requireNotNull(dir) { "repo root not found" }, "supabase/migrations/20260920060000_v3_engagement_mechanics.sql").readText()
        val seeded = Regex("""\('(weekly_\w+)', '[^']*', '[^']*', '[^']*', '(\w+)', (\d+), (\d+), \d+\)""").findAll(sql)
            .map { listOf(it.groupValues[1], it.groupValues[2], it.groupValues[3], it.groupValues[4]) }.toList()
        val mirrored = WEEKLY_QUEST_DEFS.map {
            listOf(it.id, if (it.metric == WeeklyQuestDef.Metric.XP_EARNED) "xp_earned" else "lessons_completed", it.target.toString(), it.xpReward.toString())
        }
        assertEquals(3, seeded.size)
        assertEquals(seeded, mirrored)
    }
}
