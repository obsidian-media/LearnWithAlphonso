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
