package com.obsidianmedia.learnwithalphonso.core.podcast

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Interactive branching stories (docs/archive/2026-11/2026-11-18-interactive-branching-stories-design.md): a tree of
 * read-along nodes joined by choice points that reaches one of several endings. Port of Branching.swift; mirrors
 * src/lib/branching.ts (the rules and the walk).
 *
 * The database decides the ending and the reading credit. The app sends only the option index chosen at each choice point
 * to the finish-branching-story Edge Function, which calls the service-role-only public.finish_branching_story with the
 * verified user id; that function re-walks the stored graph, so a claimed ending is never read. [Branching.walk] is the
 * same algorithm run locally to drive the screen.
 */
enum class EndingQuality(val wire: String) {
    GOOD("good"), OK("ok"), LESSER("lesser");

    companion object {
        fun fromWire(value: String?): EndingQuality? = entries.firstOrNull { it.wire == value }
    }
}

data class StoryEnding(val id: String, val title: String, val wrap: String, val quality: EndingQuality)

/** [clue] is true when the option reflects having understood the passage. It drives nothing punitive. */
data class StoryChoiceOption(val label: String, val goto: String, val clue: Boolean)

data class StoryChoice(val prompt: String, val options: List<StoryChoiceOption>)

/** Exactly one of [choice] / [next] / [ending] is present on a valid node. [artUrl] is null when the node has no art. */
data class StoryNode(
    val segments: List<String>,
    val artUrl: String? = null,
    val choice: StoryChoice? = null,
    val next: String? = null,
    val ending: StoryEnding? = null,
)

data class StoryGraph(val start: String, val map: Map<String, StoryNode>)

data class BranchingStory(val id: String, val course: String, val level: String, val title: String, val graph: StoryGraph)

/** What the server decided when a path was finished. [credited] is true the one time this finish earned the reading credit. */
data class BranchingFinish(
    val endingId: String,
    val quality: EndingQuality,
    val endingsFound: List<String>,
    val endingsTotal: Int,
    val credited: Boolean,
)

enum class NodeKind { CHOICE, LINK, ENDING, INVALID }

sealed interface BranchWalk {
    data class Awaiting(val nodeId: String) : BranchWalk
    data class Ended(val nodeId: String, val ending: StoryEnding) : BranchWalk
    data class Invalid(val reason: String) : BranchWalk
}

/** The reader's scene dots: [current] is the 1-based scene, [total] the estimate (visited + shortest route to an ending, capped at 12). */
data class SceneProgress(val current: Int, val total: Int)

enum class MapNodeKind { START, BRANCH, ENDING }
enum class MapEndingState { CURRENT, FOUND, LOCKED }
enum class MapEdgeStyle { TAKEN, FOUND, LOCKED, PLAIN }

data class MapEnding(val id: String, val title: String, val state: MapEndingState)

/** [x] and [y] are in a unit box (0..1). [ending] is set on ending nodes. */
data class MapNode(val id: String, val kind: MapNodeKind, val x: Double, val y: Double, val depth: Int, val onPath: Boolean, val ending: MapEnding?)

data class MapEdge(val from: String, val to: String, val style: MapEdgeStyle)

data class BranchMap(val nodes: List<MapNode>, val edges: List<MapEdge>, val endingsTotal: Int, val endingsFound: Int, val lockedCount: Int)

object Branching {
    /** The bucket scene art lives in (public, like the web's `story-art`). */
    const val ART_BUCKET = "story-art"

    /** What a node does: branch, link on, end, or (a content error) nothing. */
    fun nodeKind(node: StoryNode?): NodeKind = when {
        node == null -> NodeKind.INVALID
        node.ending != null -> NodeKind.ENDING
        node.choice != null && node.choice.options.isNotEmpty() -> NodeKind.CHOICE
        node.next != null -> NodeKind.LINK
        else -> NodeKind.INVALID
    }

    /**
     * Re-walks [path] (the option index chosen at each choice node, in order) from the start, auto-following linear links.
     * Stops at the choice that needs the next pick, at an ending, or reports why the path is invalid. The exact algorithm
     * public.finish_branching_story runs on the server.
     */
    fun walk(graph: StoryGraph, path: List<Int>): BranchWalk {
        var current = graph.start
        var step = 0
        for (hop in 0 until 100) {
            val node = graph.map[current] ?: return BranchWalk.Invalid("missing-node")
            val ending = node.ending
            if (ending != null) {
                // Reaching an ending with choices still left in the path means the path was fabricated.
                if (step != path.size) return BranchWalk.Invalid("unconsumed-path")
                return BranchWalk.Ended(current, ending)
            }
            val choice = node.choice
            if (choice != null) {
                if (step >= path.size) return BranchWalk.Awaiting(current)
                val index = path[step]
                if (index < 0 || index >= choice.options.size) return BranchWalk.Invalid("bad-option")
                current = choice.options[index].goto
                step += 1
                continue
            }
            val next = node.next
            if (next != null) {
                current = next
                continue
            }
            return BranchWalk.Invalid("dead-node")
        }
        return BranchWalk.Invalid("too-deep")
    }

    /** Node ids visited walking [path] from the start (links and the final node included); same guards as [walk]. */
    fun pathNodes(graph: StoryGraph, path: List<Int>): List<String> {
        val out = ArrayList<String>()
        var current = graph.start
        var step = 0
        for (hop in 0 until 100) {
            val node = graph.map[current] ?: break
            out.add(current)
            if (node.ending != null) break
            val choice = node.choice
            if (choice != null) {
                if (step >= path.size) break
                val index = path[step]
                if (index < 0 || index >= choice.options.size) break
                current = choice.options[index].goto
                step += 1
                continue
            }
            current = node.next ?: break
        }
        return out
    }

    /** The scene dots: BFS over options and links for the shortest route (in nodes) from [currentNodeId] to an ending. */
    fun sceneProgress(graph: StoryGraph, visitedCount: Int, currentNodeId: String): SceneProgress {
        var remaining = 0
        if (graph.map[currentNodeId]?.ending == null) {
            val seen = hashSetOf(currentNodeId)
            var frontier = listOf(currentNodeId)
            var depth = 0
            search@ while (frontier.isNotEmpty()) {
                depth += 1
                val nextFrontier = ArrayList<String>()
                for (id in frontier) {
                    val node = graph.map[id] ?: continue
                    val targets = node.choice?.options?.map { it.goto } ?: listOfNotNull(node.next)
                    for (t in targets) {
                        if (!seen.add(t)) continue
                        val target = graph.map[t] ?: continue
                        if (target.ending != null) { remaining = depth; break@search }
                        nextFrontier.add(t)
                    }
                }
                frontier = nextFrontier
            }
        }
        return SceneProgress(visitedCount, minOf(12, visitedCount + remaining))
    }

    /** Follows `next` links from [id] to a choice or ending node; null for a missing, dead or cyclic chain. */
    private fun resolve(graph: StoryGraph, id: String): String? {
        var current = id
        val seen = hashSetOf<String>()
        while (true) {
            if (!seen.add(current)) return null
            val node = graph.map[current] ?: return null
            when (nodeKind(node)) {
                NodeKind.ENDING, NodeKind.CHOICE -> return current
                NodeKind.LINK -> current = node.next ?: return null
                NodeKind.INVALID -> return null
            }
        }
    }

    private class Draft(val id: String, val depth: Int, val parent: Draft?) {
        val children = ArrayList<Draft>()
        var y = 0.0
    }

    /** The ending's branch map: the story's tree with linear chains collapsed, laid out in a unit box (stories-reader spec). */
    fun branchMap(graph: StoryGraph, takenPath: List<Int>, found: List<String>, currentEndingId: String?): BranchMap {
        val rootId = resolve(graph, graph.start) ?: return BranchMap(emptyList(), emptyList(), 0, 0, 0)
        val onPath = pathNodes(graph, takenPath).filter { nodeKind(graph.map[it]).let { k -> k == NodeKind.CHOICE || k == NodeKind.ENDING } }.toSet()
        val placed = hashSetOf(rootId)
        val order = ArrayList<Draft>()
        fun visit(draft: Draft) {
            order.add(draft)
            if (graph.map[draft.id]?.ending != null) return
            for (option in graph.map[draft.id]?.choice?.options.orEmpty()) {
                val childId = resolve(graph, option.goto) ?: continue
                if (!placed.add(childId)) continue
                val child = Draft(childId, draft.depth + 1, draft)
                draft.children.add(child)
                visit(child)
            }
        }
        val root = Draft(rootId, 0, null)
        visit(root)
        val leaves = order.filter { it.children.isEmpty() }
        leaves.forEachIndexed { i, d -> d.y = (i + 0.5) / leaves.size }
        for (d in order.asReversed()) if (d.children.isNotEmpty()) d.y = (d.children.first().y + d.children.last().y) / 2
        val maxInternal = order.filter { graph.map[it.id]?.ending == null }.maxOfOrNull { it.depth } ?: 0
        fun stateOf(e: StoryEnding) = when {
            e.id == currentEndingId -> MapEndingState.CURRENT
            e.id in found -> MapEndingState.FOUND
            else -> MapEndingState.LOCKED
        }
        val nodes = order.map { d ->
            val ending = graph.map[d.id]?.ending
            MapNode(
                id = d.id,
                kind = if (d === root) MapNodeKind.START else if (ending != null) MapNodeKind.ENDING else MapNodeKind.BRANCH,
                x = if (d === root) 0.0 else if (ending != null) 1.0 else d.depth.toDouble() / (maxInternal + 1),
                y = d.y, depth = d.depth, onPath = d.id in onPath,
                ending = ending?.let { MapEnding(it.id, it.title, stateOf(it)) },
            )
        }
        val byId = nodes.associateBy { it.id }
        val edges = order.drop(1).map { d ->
            val to = byId.getValue(d.id)
            val from = byId.getValue(d.parent!!.id)
            val style = when {
                from.onPath && to.onPath -> MapEdgeStyle.TAKEN
                to.ending?.state == MapEndingState.FOUND -> MapEdgeStyle.FOUND
                to.ending?.state == MapEndingState.LOCKED -> MapEdgeStyle.LOCKED
                else -> MapEdgeStyle.PLAIN
            }
            MapEdge(from.id, to.id, style)
        }
        val endings = nodes.mapNotNull { it.ending }
        val foundCount = endings.count { it.state != MapEndingState.LOCKED }
        return BranchMap(nodes, edges, endings.size, foundCount, endings.size - foundCount)
    }

    /** The text alternative for the map card. */
    fun branchMapSummary(map: BranchMap): String {
        val titles = map.nodes.mapNotNull { it.ending }.filter { it.state != MapEndingState.LOCKED }.map { it.title }
        val total = map.endingsTotal
        val m = map.endingsFound
        if (m == total && total == 1) return "You found the only ending: ${titles.joinToString(", ")}."
        if (m == total) return "You found all $total endings: ${titles.joinToString(", ")}."
        val head = "You found $m of $total endings" + if (titles.isEmpty()) "." else ": ${titles.joinToString(", ")}."
        val k = map.lockedCount
        return "$head ${if (k == 1) "1 ending is still hidden." else "$k endings are still hidden."}"
    }

    fun branchMapCaption(map: BranchMap): String =
        if (map.lockedCount > 0) "Gold = the path you just took · try the greyed branches for ${if (map.lockedCount == 1) "1 more ending" else "${map.lockedCount} more endings"}"
        else "Gold = the path you just took · you found every ending"

    /** The node after picking option [index] at [nodeId], or null when that is not a valid choice. */
    fun chooseOption(graph: StoryGraph, nodeId: String, index: Int): String? {
        val options = graph.map[nodeId]?.choice?.options ?: return null
        return if (index in options.indices) options[index].goto else null
    }

    /** Every ending in the graph in a stable order, for the endings-found tracker and the stars total. */
    fun allEndings(graph: StoryGraph): List<StoryEnding> = graph.map.keys.sorted().mapNotNull { graph.map[it]?.ending }

    /**
     * The ending screen's stars: 1 for reaching any ending, +1 for having reached a good one, +1 for having found every
     * ending. Capped at 3. Soft: a lesser ending still earns the first star.
     */
    fun stars(endingsFound: Int, endingsTotal: Int, reachedGood: Boolean): Int {
        var stars = 0
        if (endingsFound >= 1) stars += 1
        if (reachedGood) stars += 1
        if (endingsTotal > 0 && endingsFound >= endingsTotal) stars += 1
        return minOf(3, stars)
    }

    /** True when any ending the learner has found is a good one (from the stored graph, not a client claim). */
    fun reachedGood(graph: StoryGraph, found: List<String>): Boolean =
        allEndings(graph).any { it.quality == EndingQuality.GOOD && it.id in found }

    /** The public URL of a scene-art key (`<course>/<slug>/<nodeId>.jpg`), or null for no key or a key that climbs out. */
    fun artUrl(supabaseUrl: String, key: String?): String? {
        if (key.isNullOrEmpty()) return null
        val parts = key.split("/").filter { it.isNotEmpty() }
        if (parts.isEmpty() || ".." in parts || "." in parts) return null
        // Each segment is percent-encoded, so an accented slug ("l-\u00e9p\u00e9e") is a valid URL, as on web and iOS.
        val encoded = parts.map { java.net.URLEncoder.encode(it, "UTF-8").replace("+", "%20") }
        return (listOf(supabaseUrl.trimEnd('/'), "storage", "v1", "object", "public", ART_BUCKET) + encoded).joinToString("/")
    }

    /**
     * Reads the stored `nodes` object. A node the app cannot read keeps its place with no continuation, so the walk reports
     * it as invalid and the reader shows "not ready" instead of crashing; a graph without a usable start is null.
     */
    fun parseGraph(value: JsonElement?, supabaseUrl: String): StoryGraph? {
        val obj = value as? JsonObject ?: return null
        val start = obj.str("start") ?: return null
        val rawMap = obj["map"] as? JsonObject ?: return null
        val map = HashMap<String, StoryNode>()
        for ((id, raw) in rawMap) {
            val node = raw as? JsonObject ?: continue
            var choice: StoryChoice? = null
            val rawChoice = node["choice"] as? JsonObject
            val prompt = rawChoice?.str("prompt")
            if (rawChoice != null && prompt != null) {
                val options = (rawChoice["options"] as? JsonArray).orEmpty().mapNotNull { o ->
                    val option = o as? JsonObject ?: return@mapNotNull null
                    val label = option.str("label") ?: return@mapNotNull null
                    val goto = option.str("goto") ?: return@mapNotNull null
                    StoryChoiceOption(label, goto, (option["clue"] as? JsonPrimitive)?.booleanOrNull ?: false)
                }
                choice = StoryChoice(prompt, options)
            }
            var ending: StoryEnding? = null
            val rawEnding = node["ending"] as? JsonObject
            if (rawEnding != null) {
                val endingId = rawEnding.str("id")
                val title = rawEnding.str("title")
                val wrap = rawEnding.str("wrap")
                val quality = EndingQuality.fromWire(rawEnding.str("quality"))
                if (endingId != null && title != null && wrap != null && quality != null) ending = StoryEnding(endingId, title, wrap, quality)
            }
            map[id] = StoryNode(
                segments = (node["segments"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content },
                artUrl = artUrl(supabaseUrl, node.str("art")),
                choice = choice,
                next = node.str("next"),
                ending = ending,
            )
        }
        if (start !in map) return null
        return StoryGraph(start, map)
    }

    fun status(completed: Boolean): String = if (completed) BranchingCopy.FINISHED_STATUS else BranchingCopy.BADGE

    private fun JsonObject.str(key: String): String? =
        this[key]?.takeUnless { it is JsonNull }?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
}

object BranchingCopy {
    /** The library badge on a story that has choices. */
    const val BADGE = "Choose your path"
    const val FINISHED_STATUS = "Ending found, try another path"
    const val YOUR_ENDING = "Your ending"
    const val TRY_ANOTHER_PATH = "Try another path"
    const val READ_IT_AGAIN = "Read it again"
    const val CONTINUE = "Continue"
    const val SEE_YOUR_ENDING = "See your ending"
    const val COUNTS_LINE = "This counts toward your reading practice."
    const val NOT_READY = "This part of the story isn't ready yet."
    const val START_OVER = "Start over"
    const val SAVE_FAILED = "We couldn't save your path. Check your connection, then try again. Your reading counts once it saves."
    const val RETRY_SAVE = "Save again"

    fun endingsFound(found: Int, total: Int): String = "Endings found: $found of $total"
    fun starsLabel(stars: Int): String = "$stars of 3 stars"

    fun message(error: PodcastQuizError): String = when (error) {
        PodcastQuizError.NOT_FOUND -> "This story isn't available right now."
        PodcastQuizError.INVALID_ANSWERS -> "That path couldn't be saved. Try another path."
        else -> PodcastQuizCopy.message(error)
    }
}
