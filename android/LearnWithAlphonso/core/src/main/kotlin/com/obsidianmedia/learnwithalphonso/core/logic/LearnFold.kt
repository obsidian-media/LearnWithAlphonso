package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * Learn screen folding (round 6.1, option A); the same rules as src/lib/learn-fold.ts and the iOS Kit LearnFold.
 *  - finished units fold into ONE row per unbroken run ("Units 1-9")
 *  - the current unit (first with an undone lesson) is open
 *  - units after it are folded with only their name
 */
data class FoldUnit(val id: String, val eyebrow: String, val title: String, val lessonIds: List<String>)

sealed interface FoldRow {
    val key: String

    data class DoneRun(
        override val key: String,
        val unitIds: List<String>,
        val first: String,
        val last: String,
        val done: Int,
        val total: Int,
    ) : FoldRow

    data class UnitRow(
        override val key: String,
        val unitId: String,
        val current: Boolean,
        val done: Int,
        val total: Int,
    ) : FoldRow
}

data class CurrentUnit(val index: Int, val count: Int, val unitId: String, val lessonId: String)

object LearnFold {
    fun foldLearn(units: List<FoldUnit>, completed: Set<String>): List<FoldRow> {
        val rows = mutableListOf<FoldRow>()
        var currentTaken = false
        for (u in units) {
            val done = u.lessonIds.count { it in completed }
            val total = u.lessonIds.size
            if (total > 0 && done == total) {
                val prev = rows.lastOrNull()
                if (prev is FoldRow.DoneRun) {
                    rows[rows.lastIndex] = prev.copy(unitIds = prev.unitIds + u.id, last = u.eyebrow, done = prev.done + done, total = prev.total + total)
                } else {
                    rows.add(FoldRow.DoneRun("run-${u.id}", listOf(u.id), u.eyebrow, u.eyebrow, done, total))
                }
                continue
            }
            rows.add(FoldRow.UnitRow(u.id, u.id, current = !currentTaken, done = done, total = total))
            currentTaken = true
        }
        return rows
    }

    /** "Unit 3" / "Units 1-9" label for a done run. */
    fun runLabel(row: FoldRow.DoneRun): String {
        fun num(s: String) = s.replace(Regex("""^Unit\s+""", RegexOption.IGNORE_CASE), "")
        return if (row.first == row.last) row.first else "Units ${num(row.first)}-${num(row.last)}"
    }

    /** The learner's place in the whole course: first lesson not done, with the unit's 1-based place of `count`. */
    fun currentUnitOf(units: List<FoldUnit>, completed: Set<String>): CurrentUnit? {
        units.forEachIndexed { i, u ->
            val lessonId = u.lessonIds.firstOrNull { it !in completed }
            if (lessonId != null) return CurrentUnit(i + 1, units.size, u.id, lessonId)
        }
        return null
    }

    /** Painted rooms in a fixed order (same as web ROOM_ART); a unit's room is its place in the course modulo the list. */
    val ROOM_ART = listOf(
        "classroom", "market", "garden", "station", "kitchen", "seaside", "library", "radio", "office", "farm",
        "gallery", "gym", "lab", "newsroom", "theatre", "bank", "bedroom", "dining", "techshop", "courtroom", "chamber",
    )

    fun roomArtFor(unitIndex0: Int): String = ROOM_ART[((unitIndex0 % ROOM_ART.size) + ROOM_ART.size) % ROOM_ART.size]

    fun roomName(art: String): String = when (art) {
        "techshop" -> "Tech Shop"
        else -> art.replaceFirstChar { it.uppercase() }
    }
}
