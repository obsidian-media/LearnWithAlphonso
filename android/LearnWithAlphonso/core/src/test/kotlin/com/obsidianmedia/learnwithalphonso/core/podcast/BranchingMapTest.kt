package com.obsidianmedia.learnwithalphonso.core.podcast

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The reader's pure logic for the cinematic reader and the ending's branch map: pathNodes, sceneProgress, branchMap, the
 * summary and the caption. Same fixtures as src/lib/branching.test.ts and the iOS Kit tests (stories-reader spec).
 */
class BranchingMapTest {
    private fun ending(n: Int) = StoryNode(listOf("e$n"), ending = StoryEnding("end$n", "T$n", "wrap $n", EndingQuality.GOOD))
    private fun choice(vararg gotos: String) =
        StoryNode(listOf("c"), choice = StoryChoice("p", gotos.map { StoryChoiceOption("label $it", it, false) }))
    private fun link(next: String) = StoryNode(listOf("l"), next = next)

    /** start(choice a,b); a(choice e1,e2); b(link b2); b2(choice e3,e4). */
    private val fixtureA = StoryGraph(
        "start",
        mapOf(
            "start" to choice("a", "b"),
            "a" to choice("e1", "e2"),
            "b" to link("b2"),
            "b2" to choice("e3", "e4"),
            "e1" to ending(1), "e2" to ending(2), "e3" to ending(3), "e4" to ending(4),
        ),
    )

    private fun mapA(found: List<String> = listOf("end1", "end3"), current: String? = "end1", path: List<Int> = listOf(0, 0)) =
        Branching.branchMap(fixtureA, path, found, current)

    private fun BranchMap.node(id: String) = nodes.first { it.id == id }
    private fun BranchMap.edge(from: String, to: String) = edges.first { it.from == from && it.to == to }

    // pathNodes

    @Test
    fun `pathNodes includes links and the final node`() {
        val g = StoryGraph("start", mapOf("start" to choice("a"), "a" to link("b"), "b" to ending(1)))
        assertEquals(listOf("start", "a", "b"), Branching.pathNodes(g, listOf(0)))
        assertEquals(listOf("start", "a", "b", "e1").take(3), Branching.pathNodes(g, listOf(0)))
    }

    @Test
    fun `pathNodes follows fixture A through the collapsed link`() {
        assertEquals(listOf("start", "b", "b2", "e4"), Branching.pathNodes(fixtureA, listOf(1, 1)))
        assertEquals(listOf("start"), Branching.pathNodes(fixtureA, emptyList()))
    }

    @Test
    fun `pathNodes stops cleanly on a bad option or a missing node`() {
        assertEquals(listOf("start"), Branching.pathNodes(fixtureA, listOf(9)))
        assertEquals(listOf("start", "a"), Branching.pathNodes(fixtureA, listOf(0, -1)))
        val dangling = StoryGraph("start", mapOf("start" to link("nowhere")))
        assertEquals(listOf("start"), Branching.pathNodes(dangling, emptyList()))
        val cycle = StoryGraph("x", mapOf("x" to link("y"), "y" to link("x")))
        assertEquals(100, Branching.pathNodes(cycle, emptyList()).size)
    }

    // sceneProgress

    @Test
    fun `sceneProgress at the start of fixture A is 1 of 3`() {
        assertEquals(SceneProgress(1, 3), Branching.sceneProgress(fixtureA, 1, "start"))
    }

    @Test
    fun `sceneProgress at an ending is n of n and the total is capped at 12`() {
        assertEquals(SceneProgress(3, 3), Branching.sceneProgress(fixtureA, 3, "e1"))
        // via the link: start(1) -> b -> b2 -> e3 is 3 more from start, but b2 is 1 away from an ending.
        assertEquals(SceneProgress(3, 4), Branching.sceneProgress(fixtureA, 3, "b2"))
        assertEquals(12, Branching.sceneProgress(fixtureA, 15, "e1").total)
    }

    // branchMap, fixture A

    @Test
    fun `fixture A layout collapses the link and places endings at x 1`() {
        val map = mapA()
        val root = map.nodes.first()
        assertEquals("start", root.id)
        assertEquals(MapNodeKind.START, root.kind)
        assertEquals(0.0, root.x, 1e-9)
        assertTrue(map.nodes.none { it.id == "b" })
        val endings = map.nodes.filter { it.kind == MapNodeKind.ENDING }
        assertEquals(listOf("e1", "e2", "e3", "e4"), endings.map { it.id })
        assertEquals(listOf(0.125, 0.375, 0.625, 0.875), endings.map { it.y })
        assertTrue(endings.all { it.x == 1.0 })
        assertEquals(0.25, map.node("a").y, 1e-9)
        assertEquals(0.75, map.node("b2").y, 1e-9)
        assertEquals(0.5, map.node("a").x, 1e-9)
        assertEquals(MapNodeKind.BRANCH, map.node("a").kind)
    }

    @Test
    fun `fixture A edges carry the path, found and locked styles`() {
        val map = mapA()
        assertEquals(MapEdgeStyle.TAKEN, map.edge("start", "a").style)
        assertEquals(MapEdgeStyle.TAKEN, map.edge("a", "e1").style)
        assertEquals(MapEdgeStyle.LOCKED, map.edge("a", "e2").style)
        assertEquals(MapEdgeStyle.PLAIN, map.edge("start", "b2").style)
        assertEquals(MapEdgeStyle.FOUND, map.edge("b2", "e3").style)
        assertEquals(MapEdgeStyle.LOCKED, map.edge("b2", "e4").style)
        assertEquals(6, map.edges.size)
    }

    @Test
    fun `fixture A counts, states and on-path flags`() {
        val map = mapA()
        assertEquals(2, map.endingsFound)
        assertEquals(4, map.endingsTotal)
        assertEquals(2, map.lockedCount)
        assertEquals(MapEndingState.CURRENT, map.node("e1").ending!!.state)
        assertEquals(MapEndingState.FOUND, map.node("e3").ending!!.state)
        assertEquals(MapEndingState.LOCKED, map.node("e4").ending!!.state)
        assertEquals("end1", map.node("e1").ending!!.id)
        assertTrue(map.node("start").onPath && map.node("a").onPath && map.node("e1").onPath)
        assertFalse(map.node("b2").onPath)
        assertNull(map.node("a").ending)
    }

    @Test
    fun `fixture A summary and caption`() {
        val map = mapA()
        assertEquals("You found 2 of 4 endings: T1, T3. 2 endings are still hidden.", Branching.branchMapSummary(map))
        assertEquals("Gold = the path you just took · try the greyed branches for 2 more endings", Branching.branchMapCaption(map))
    }

    // Fixture B

    @Test
    fun `fixture B an ending at depth 1 beside a deeper branch is still at x 1`() {
        val g = StoryGraph("start", mapOf("start" to choice("e1", "a"), "a" to choice("e2", "e3"), "e1" to ending(1), "e2" to ending(2), "e3" to ending(3)))
        val map = Branching.branchMap(g, listOf(0), listOf("end1"), "end1")
        assertEquals(1.0, map.node("e1").x, 1e-9)
        assertEquals(0.5, map.node("a").x, 1e-9)
        assertEquals(1.0, map.node("e3").x, 1e-9)
        assertEquals(3, map.endingsTotal)
    }

    // Fixture C

    @Test
    fun `fixture C a DAG shows a shared node once`() {
        val g = StoryGraph("start", mapOf("start" to choice("x", "x"), "x" to choice("e1", "e2"), "e1" to ending(1), "e2" to ending(2)))
        val map = Branching.branchMap(g, emptyList(), emptyList(), null)
        assertEquals(1, map.nodes.count { it.id == "x" })
        assertEquals(1, map.edges.count { it.from == "start" && it.to == "x" })
        assertEquals(4, map.nodes.size)
    }

    @Test
    fun `fixture C a link cycle does not hang and that branch is dropped`() {
        val g = StoryGraph(
            "start",
            mapOf("start" to choice("c", "e1"), "c" to link("c2"), "c2" to link("c"), "e1" to ending(1)),
        )
        val map = Branching.branchMap(g, emptyList(), emptyList(), null)
        assertEquals(listOf("start", "e1"), map.nodes.map { it.id })
        assertEquals(1, map.edges.size)
        assertNotNull(map.edges.firstOrNull())
    }

    @Test
    fun `fixture C a choice looping back to a placed node does not duplicate it`() {
        val g = StoryGraph("start", mapOf("start" to choice("a", "e1"), "a" to choice("start", "e2"), "e1" to ending(1), "e2" to ending(2)))
        val map = Branching.branchMap(g, emptyList(), emptyList(), null)
        assertEquals(1, map.nodes.count { it.id == "start" })
        assertEquals(2, map.endingsTotal)
    }

    // Fixture D

    @Test
    fun `fixture D everything found`() {
        val map = Branching.branchMap(fixtureA, listOf(0, 0), listOf("end1", "end2", "end3", "end4"), "end1")
        assertEquals("You found all 4 endings: T1, T2, T3, T4.", Branching.branchMapSummary(map))
        assertEquals("Gold = the path you just took · you found every ending", Branching.branchMapCaption(map))
        assertEquals(0, map.lockedCount)
    }

    @Test
    fun `fixture D singular forms`() {
        val three = Branching.branchMap(fixtureA, listOf(0, 0), listOf("end1", "end2", "end3"), "end1")
        assertEquals("You found 3 of 4 endings: T1, T2, T3. 1 ending is still hidden.", Branching.branchMapSummary(three))
        assertEquals("Gold = the path you just took · try the greyed branches for 1 more ending", Branching.branchMapCaption(three))
        val single = StoryGraph("start", mapOf("start" to link("e1"), "e1" to ending(1)))
        val map = Branching.branchMap(single, emptyList(), listOf("end1"), "end1")
        assertEquals("You found the only ending: T1.", Branching.branchMapSummary(map))
    }

    @Test
    fun `edge cases a root ending, zero found and a dead end`() {
        val rootEnding = StoryGraph("e1", mapOf("e1" to ending(1)))
        val m = Branching.branchMap(rootEnding, emptyList(), listOf("end1"), "end1")
        assertEquals(MapNodeKind.START, m.nodes.single().kind)
        assertEquals(0.0, m.nodes.single().x, 1e-9)
        val none = Branching.branchMap(fixtureA, listOf(0, 0), emptyList(), null)
        assertEquals("You found 0 of 4 endings. 4 endings are still hidden.", Branching.branchMapSummary(none))
        val dead = StoryGraph("start", mapOf("start" to link("d"), "d" to StoryNode(listOf("x"))))
        assertEquals(listOf("start", "d"), Branching.pathNodes(dead, emptyList()))
    }
}
