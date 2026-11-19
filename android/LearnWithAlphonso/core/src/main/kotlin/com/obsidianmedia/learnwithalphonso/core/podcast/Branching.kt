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
 * Interactive branching stories (docs/superpowers/specs/2026-11-18-interactive-branching-stories-design.md): a tree of
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
        return (listOf(supabaseUrl.trimEnd('/'), "storage", "v1", "object", "public", ART_BUCKET) + parts).joinToString("/")
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
