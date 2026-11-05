package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.PlacementQuestion
import com.obsidianmedia.learnwithalphonso.core.content.placementOrder
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.random.Random

/** Vectors from src/data/placement.test.ts and PlacementLogicTests.swift, over the real bundled English pool. */
class PlacementLogicTest {
    private val pool: List<PlacementQuestion> by lazy {
        val store = ContentStore { name ->
            checkNotNull(javaClass.getResourceAsStream("/$name")).bufferedReader().readText()
        }
        store.placementPool(Course.ENGLISH)
    }

    private fun mc(id: String, level: String) = PlacementQuestion.MultipleChoice(id, level, "p", listOf("a", "b"), 0)

    @Test
    fun `picks three per band in band order from the pool with no duplicates`() {
        val set = pickPlacementSet(pool, Random(42))
        assertEquals(15, set.size)
        assertEquals(placementOrder.flatMap { l -> List(3) { l } }, set.map { it.level })
        assertEquals(set.size, set.map { it.id }.toSet().size)
        assertTrue(set.all { it in pool })
    }

    @Test
    fun `a band with only two candidates yields two`() {
        val small = listOf(mc("a", "A1"), mc("b", "A1"), mc("c", "A2"), mc("d", "A2"), mc("e", "A2"), mc("f", "A2"))
        val set = pickPlacementSet(small, Random(1))
        assertEquals(listOf("A1", "A1", "A2", "A2", "A2"), set.map { it.level })
    }

    @Test
    fun `different seeds give a different set`() {
        val a = pickPlacementSet(pool, Random(1)).map { it.id }
        val b = pickPlacementSet(pool, Random(2)).map { it.id }
        assertTrue(a != b)
    }

    @Test
    fun `playable pool drops listening only when audio cannot play`() {
        val mixed = listOf(mc("a", "A1"), PlacementQuestion.Listening("l", "A1", "p", "audio", listOf("audio"), "audio"))
        assertEquals(mixed, playablePlacementPool(mixed, canPlayAudio = true))
        assertEquals(listOf(mixed[0]), playablePlacementPool(mixed, canPlayAudio = false))
    }

    @Test
    fun `scorePlacement places one band above the last consecutive pass`() {
        assertEquals(PlacementScore("A1", emptyList()), scorePlacement(placementOrder.associateWith { 0 }))
        assertEquals(PlacementScore("A1", emptyList()), scorePlacement(mapOf("A1" to 1)))
        assertEquals(PlacementScore("A2", listOf("A1")), scorePlacement(mapOf("A1" to 2)))
        assertEquals(PlacementScore("B1", listOf("A1", "A2")), scorePlacement(mapOf("A1" to 3, "A2" to 3, "B1" to 1)))
        assertEquals(PlacementScore("C1", placementOrder), scorePlacement(placementOrder.associateWith { 3 }))
        assertEquals(PlacementScore("A1", emptyList()), scorePlacement(emptyMap()))
    }

    @Test
    fun `groupByBand keeps every band key`() {
        val grouped = groupByBand(listOf(mc("a", "A1"), mc("b", "B2")))
        assertEquals(placementOrder.toSet(), grouped.keys)
        assertEquals(1, grouped.getValue("A1").size)
        assertEquals(0, grouped.getValue("C1").size)
    }

    @Test
    fun `nextAdaptiveBand vectors`() {
        val full = groupByBand(placementOrder.flatMap { l -> List(3) { i -> mc("$l$i", l) } })
        val empty = groupByBand(emptyList())
        val a1Only = groupByBand(List(3) { mc("A1$it", "A1") })

        assertEquals(AdaptiveBandDecision(true, null, 0), nextAdaptiveBand(full, 0, 0))
        assertEquals(AdaptiveBandDecision(true, null, 0), nextAdaptiveBand(empty, 0, 0))
        assertEquals(AdaptiveBandDecision(false, null, 1), nextAdaptiveBand(full, 0, 1))
        assertEquals(AdaptiveBandDecision(false, "A2", 2), nextAdaptiveBand(full, 0, 3))
        assertEquals(AdaptiveBandDecision(false, "B2", 4), nextAdaptiveBand(full, 2, 3))
        assertEquals(AdaptiveBandDecision(false, null, 4), nextAdaptiveBand(full, 3, 3))
        assertEquals(AdaptiveBandDecision(false, null, 5), nextAdaptiveBand(full, 4, 3))
        assertEquals(AdaptiveBandDecision(true, null, 4), nextAdaptiveBand(full, 4, 0))
        assertEquals(AdaptiveBandDecision(false, null, 1), nextAdaptiveBand(a1Only, 0, 3))
    }

    /** A pool with [size] multiple-choice questions in each of the given bands and none anywhere else. */
    private fun bandsOf(levels: List<String>, size: Int = 3): Map<String, List<PlacementQuestion>> =
        groupByBand(levels.flatMap { l -> List(size) { i -> mc("$l-$i", l) } })

    /** A tally with the given real counts and standing skips, everything else zero. */
    private fun tallyOf(correct: Map<String, Int>, skipped: List<String> = emptyList(), revisiting: Boolean = false) =
        PlacementTally(placementOrder.associateWith { 0 } + correct, skipped, revisiting)

    /** The state right after acing A1: A2 skipped on credit, B1 about to be asked. */
    private val afterSkip = tallyOf(mapOf("A1" to 3, "A2" to PLACEMENT_PASS_MARK), listOf("A2"))

    @Test
    fun `resolveBand agrees with nextAdaptiveBand when no skip is in play and records the real count`() {
        val full = bandsOf(placementOrder)
        assertEquals(BandResolution(true, 0, tallyOf(mapOf("A1" to 0))), resolveBand(full, 0, 0, PlacementTally()))
        assertEquals(BandResolution(false, 1, tallyOf(mapOf("A1" to 1))), resolveBand(full, 0, 1, PlacementTally()))
        assertEquals(BandResolution(false, 1, tallyOf(mapOf("A1" to 2))), resolveBand(full, 0, 2, PlacementTally()))
    }

    @Test
    fun `resolveBand skips a band on a perfect score and credits it as a provisional skip`() {
        assertEquals(BandResolution(false, 2, afterSkip), resolveBand(bandsOf(placementOrder), 0, 3, PlacementTally()))
    }

    @Test
    fun `resolveBand does not treat a failed band as a lost bet unless it is the band after a skip`() {
        // A1 2 of 3 is a pass, so A2 is asked normally; A2 then 1 of 3. Nothing was skipped, nothing to withdraw.
        assertEquals(
            BandResolution(false, 2, tallyOf(mapOf("A1" to 2, "A2" to 1))),
            resolveBand(bandsOf(placementOrder), 1, 1, tallyOf(mapOf("A1" to 2))),
        )
    }

    @Test
    fun `resolveBand withdraws the credit and goes back to the skipped band when the band after the skip is failed`() {
        val full = bandsOf(placementOrder)
        for (correct in listOf(0, 1)) {
            assertEquals(
                // nextIdx 1 is BACKWARDS: A2, the band that was skipped.
                BandResolution(false, 1, tallyOf(mapOf("A1" to 3, "A2" to 0, "B1" to correct), revisiting = true)),
                resolveBand(full, 2, correct, afterSkip),
                "B1 $correct of 3",
            )
        }
    }

    @Test
    fun `resolveBand judges a fail by the pass mark and not by anything but zero`() {
        // 1 of 3 is not a pass, so it is a fail here -- even though nextAdaptiveBand calls it "partial credit".
        val full = bandsOf(placementOrder)
        assertEquals(2, PLACEMENT_PASS_MARK)
        assertEquals(3, nextAdaptiveBand(full, 2, 1).nextIdx)
        assertEquals(1, resolveBand(full, 2, 1, afterSkip).nextIdx)
    }

    @Test
    fun `resolveBand ends after the band it went back to and places on that bands real answers`() {
        val full = bandsOf(placementOrder)
        val wentBack = resolveBand(full, 2, 0, afterSkip).tally
        assertTrue(wentBack.revisiting)
        val expected = mapOf(0 to "A2", 1 to "A2", 2 to "B1", 3 to "B1")
        for (correct in 0..3) {
            val end = resolveBand(full, 1, correct, wentBack)
            assertTrue(end.stop, "A2 $correct of 3")
            assertFalse(end.tally.revisiting)
            assertEquals(emptyList<String>(), end.tally.skippedLevels)
            assertEquals(correct, end.tally.correctByLevel["A2"])
            assertEquals(expected[correct], scorePlacement(end.tally.correctByLevel).level, "A2 $correct of 3")
        }
    }

    @Test
    fun `resolveBand withdraws the credit and ends placing at the skipped band when that band has no questions`() {
        // A1, B1, C1 only: A2 can be skipped (B1 lies beyond it) but never asked.
        val thin = bandsOf(listOf("A1", "B1", "C1"))
        val skipped = resolveBand(thin, 0, 3, PlacementTally())
        assertEquals(listOf("A2"), skipped.tally.skippedLevels)
        val failed = resolveBand(thin, 2, 0, skipped.tally)
        assertEquals(BandResolution(true, 2, tallyOf(mapOf("A1" to 3, "A2" to 0, "B1" to 0))), failed)
        assertEquals("A2", scorePlacement(failed.tally.correctByLevel).level)
    }

    @Test
    fun `resolveBand keeps the credit and carries on when the band after the skip is passed`() {
        val full = bandsOf(placementOrder)
        assertEquals(
            BandResolution(false, 3, tallyOf(mapOf("A1" to 3, "A2" to 2, "B1" to 2), listOf("A2"))),
            resolveBand(full, 2, 2, afterSkip),
        )
        assertEquals(
            BandResolution(false, 4, tallyOf(mapOf("A1" to 3, "A2" to 2, "B1" to 3, "B2" to 2), listOf("A2", "B2"))),
            resolveBand(full, 2, 3, afterSkip),
        )
        val doubleSkip = tallyOf(mapOf("A1" to 3, "A2" to 2, "B1" to 3, "B2" to 2), listOf("A2", "B2"))
        val end = resolveBand(full, 4, 2, doubleSkip)
        assertEquals(5, end.nextIdx) // past C1: nothing left to ask
        assertEquals(listOf("A2", "B2"), end.tally.skippedLevels)
        assertEquals("C1", scorePlacement(end.tally.correctByLevel).level)
    }

    @Test
    fun `resolveBand goes back to the right band after a skip higher up and keeps an earlier skip that still stands`() {
        // A1 and B1 aced: A2 and B2 skipped, C1 next. C1 failed: B2's credit goes, A2's stays (B1 backs it).
        val doubleSkip = tallyOf(mapOf("A1" to 3, "A2" to 2, "B1" to 3, "B2" to 2), listOf("A2", "B2"))
        assertEquals(
            BandResolution(false, 3, tallyOf(mapOf("A1" to 3, "A2" to 2, "B1" to 3, "B2" to 0, "C1" to 0), listOf("A2"), revisiting = true)),
            resolveBand(bandsOf(placementOrder), 4, 0, doubleSkip),
        )
    }

    private data class Sitting(
        /** The bands the exam asked, in order. */
        val asked: List<String>,
        /** Correct answers in each band that was asked. */
        val real: Map<String, Int>,
        val tally: PlacementTally,
    )

    /** Every sitting the exam can produce from this pool: each band it asks gets every possible score. */
    private fun allSittings(pool: Map<String, List<PlacementQuestion>>): List<Sitting> {
        val sittings = mutableListOf<Sitting>()
        fun walk(idx: Int, tally: PlacementTally, asked: List<String>, real: Map<String, Int>) {
            val level = placementOrder[idx]
            for (correct in 0..(pool[level]?.size ?: 0)) {
                val resolution = resolveBand(pool, idx, correct, tally)
                val nextReal = real + (level to correct)
                val nextBand = placementOrder.getOrNull(resolution.nextIdx)?.let { pool[it] }.orEmpty()
                if (resolution.stop || nextBand.isEmpty()) {
                    sittings += Sitting(asked + level, nextReal, resolution.tally)
                } else {
                    walk(resolution.nextIdx, resolution.tally, asked + level, nextReal)
                }
            }
        }
        walk(0, PlacementTally(), emptyList(), emptyMap())
        return sittings
    }

    /**
     * The property the whole skip mechanism has to keep, stated once and checked over EVERY possible sitting rather
     * than a handful of examples: a placement is never higher than the learner's real answers support. The bug this
     * pins -- ace A1, fail B1, get placed at B1 on a credit for an A2 nobody asked -- is one sitting out of hundreds;
     * the examples above name the ones that matter, this proves there is not another one like it.
     */
    @Test
    fun `a skipped bands credit never places a learner above what they really answered`() {
        // [name, pool, a floor on how many sittings it has]. The floor is far under the real count (214, 10 and 79
        // when this was written) and is only there so an enumeration that quietly stopped enumerating cannot pass.
        val pools = listOf(
            Triple("a full pool", bandsOf(placementOrder), 100),
            Triple("a pool with no A2 or B2", bandsOf(listOf("A1", "B1", "C1")), 5),
            Triple("a pool with a one-question B1", bandsOf(placementOrder) + ("B1" to bandsOf(listOf("B1"), 1).getValue("B1")), 30),
        )
        for ((name, pool, floor) in pools) {
            val sittings = allSittings(pool)
            assertTrue(sittings.size >= floor, "$name has only ${sittings.size} sittings")

            for (s in sittings) {
                val story = "$name: asked " + s.asked.joinToString(" ") { "$it:${s.real[it]}" }

                // A band is asked at most once, so a sitting never exceeds the 15 questions the exam advertises.
                assertEquals(s.asked.size, s.asked.toSet().size, story)

                // Every credit still standing at the end rests on a REAL pass of the band above it -- and the band
                // itself was not asked.
                for (skipped in s.tally.skippedLevels) {
                    val above = placementOrder[placementOrder.indexOf(skipped) + 1]
                    assertFalse(skipped in s.asked, story)
                    assertTrue((s.real[above] ?: 0) >= PLACEMENT_PASS_MARK, story)
                }

                // The tally is the real counts, plus the pass mark for each standing skip, and nothing else.
                for (level in placementOrder) {
                    val expected = if (level in s.tally.skippedLevels) PLACEMENT_PASS_MARK else (s.real[level] ?: 0)
                    assertEquals(expected, s.tally.correctByLevel[level], "$story / $level")
                }

                // The headline claim: placed no higher than one band above the highest band really passed.
                val highest = s.asked.filter { (s.real[it] ?: 0) >= PLACEMENT_PASS_MARK }.maxOfOrNull { placementOrder.indexOf(it) } ?: -1
                val placed = placementOrder.indexOf(scorePlacement(s.tally.correctByLevel).level)
                assertTrue(placed <= minOf(placementOrder.size - 1, highest + 1), story)
            }
        }
    }

    @Test
    fun `the sitting from the bug report is in the enumeration and ends at A2 at most`() {
        // A1 3/3 (A2 skipped), B1 0/3 (fail), then A2 asked: the old exam ended at B1 here, after two bands.
        val bug = allSittings(bandsOf(placementOrder)).filter { it.asked == listOf("A1", "B1", "A2") && it.real["A1"] == 3 && it.real["B1"] == 0 }
        assertEquals(4, bug.size) // A2 asked, 0..3 correct
        for (s in bug) {
            val a2 = s.real.getValue("A2")
            assertEquals(if (a2 >= 2) "B1" else "A2", scorePlacement(s.tally.correctByLevel).level, "A2 answered $a2 of 3")
        }
    }

    @Test
    fun `isPlacementAnswerCorrect grades text and treats blank as wrong`() {
        val mcQ = PlacementQuestion.MultipleChoice("m", "A1", "p", listOf("are", "is"), 1)
        val listening = PlacementQuestion.Listening("l", "A1", "p", "Good morning", listOf("Good morning", "Good night"), "Good morning")
        val translate = PlacementQuestion.Translate("t", "B1", "p", listOf("I don't understand."))
        assertTrue(isPlacementAnswerCorrect(mcQ, "is"))
        assertFalse(isPlacementAnswerCorrect(mcQ, "1"))
        assertTrue(isPlacementAnswerCorrect(listening, "Good morning"))
        assertTrue(isPlacementAnswerCorrect(translate, "i do not understand"))
        assertFalse(isPlacementAnswerCorrect(translate, "  "))
        assertFalse(isPlacementAnswerCorrect(mcQ, null))
    }
}
