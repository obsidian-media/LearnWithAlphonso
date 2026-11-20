package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * The Learn screen's climbing map ("Path B"), as data: one climb per unit, its lesson nodes (done / next / locked),
 * the reward chest that crowns it, the unit strip, the trailhead and the start sheet for the next lesson, and where
 * each node sits on the winding trail. No drawing here: web, iOS and Android draw the same climb from it.
 *
 * The same rules as src/lib/learn-map.ts and the iOS Kit LearnMap. All three replay shared/learn-map.json.
 */
object LearnMap {
    /** A lesson as the map needs it, built from the curriculum lesson. [subtitle] is the one-line coverage. */
    data class Lesson(val id: String, val title: String, val subtitle: String, val questionTypes: List<String>, val wordCount: Int)

    /** A unit of the level on screen, in curriculum order. */
    data class Unit(val id: String, val title: String, val lessons: List<Lesson>)

    enum class NodeState(val key: String) { DONE("done"), NEXT("next"), LOCKED("locked") }

    /** A spot on the climb, as fractions of the map's width (x, from the left) and height (y, from the top). */
    data class Point(val x: Double, val y: Double)

    data class Node(val id: String, val title: String, val state: NodeState, val point: Point)

    /** The unit's reward chest, the top of the climb: earned once every lesson of the unit is done. */
    data class Chest(val earned: Boolean, val point: Point)

    /**
     * Where the climb starts: the plain trailhead, or (once a unit is finished) its earned chest at the foot of the
     * next unit's climb.
     */
    sealed interface Trailhead {
        data object Start : Trailhead
        data class EarnedChest(val unitId: String) : Trailhead
    }

    /** "Unit N · name" with "done/total" and a thin progress bar. N is the unit's place in the level. */
    data class Strip(val number: Int, val count: Int, val name: String, val done: Int, val total: Int, val progress: Double)

    /** The start sheet for the next lesson: name, one-line coverage, and its time / XP / word chips. */
    data class StartSheet(val lessonId: String, val title: String, val coverage: String, val minutes: Int, val xp: Int, val words: Int)

    data class Climb(
        val unitId: String,
        val strip: Strip,
        /** Bottom of the climb first. */
        val nodes: List<Node>,
        val chest: Chest,
        val trailhead: Trailhead,
        /** null when the unit is finished. */
        val next: StartSheet?,
    )

    const val TRAIL_BOTTOM = 0.9
    const val TRAIL_TOP = 0.06
    /** The winding: lesson nodes swing left, centre, right, centre, and the chest sits in the middle at the top. */
    val TRAIL_SWING = listOf(0.36, 0.5, 0.64, 0.5)
    const val CHEST_X = 0.5

    /** Where slot [index] of a climb with [slots] slots sits (the lessons, bottom first, then the chest last). */
    fun point(index: Int, slots: Int): Point {
        // Measured down from the top, so the chest (the last slot) sits at exactly TRAIL_TOP on every platform.
        val y = if (slots <= 1) TRAIL_TOP else TRAIL_TOP + (TRAIL_BOTTOM - TRAIL_TOP) * (slots - 1 - index) / (slots - 1)
        val x = if (index == slots - 1) CHEST_X else TRAIL_SWING[index % TRAIL_SWING.size]
        return Point(x, y)
    }

    private fun Unit.done(completed: Set<String>) = lessons.all { it.id in completed }

    /**
     * The climb for one unit of the level. Without [unitId] it is the learner's current unit: the first with a lesson
     * not done, or the last unit when the whole level is done. null for a level with no units (or an unknown unitId).
     */
    fun of(units: List<Unit>, completed: Set<String>, timing: LessonTiming, unitId: String? = null): Climb? {
        if (units.isEmpty()) return null
        val index = if (unitId != null) {
            units.indexOfFirst { it.id == unitId }.takeIf { it >= 0 } ?: return null
        } else {
            units.indexOfFirst { !it.done(completed) }.takeIf { it >= 0 } ?: units.lastIndex
        }
        val unit = units[index]
        val slots = unit.lessons.size + 1
        val nextIndex = unit.lessons.indexOfFirst { it.id !in completed }
        val nodes = unit.lessons.mapIndexed { i, l ->
            val state = when {
                l.id in completed -> NodeState.DONE
                i == nextIndex -> NodeState.NEXT
                else -> NodeState.LOCKED
            }
            Node(l.id, l.title, state, point(i, slots))
        }
        val done = unit.lessons.count { it.id in completed }
        val total = unit.lessons.size
        val previous = units.getOrNull(index - 1)
        val nextLesson = unit.lessons.getOrNull(nextIndex)
        return Climb(
            unitId = unit.id,
            strip = Strip(index + 1, units.size, unit.title, done, total, if (total == 0) 0.0 else done.toDouble() / total),
            nodes = nodes,
            chest = Chest(done == total, point(slots - 1, slots)),
            trailhead = if (previous != null && previous.done(completed)) Trailhead.EarnedChest(previous.id) else Trailhead.Start,
            next = nextLesson?.let {
                StartSheet(
                    lessonId = it.id,
                    title = it.title,
                    coverage = it.subtitle,
                    minutes = timing.estimateMinutes(it.questionTypes, it.wordCount),
                    xp = LessonXp.maxXp(it.questionTypes.size),
                    words = it.wordCount,
                )
            },
        )
    }
}
