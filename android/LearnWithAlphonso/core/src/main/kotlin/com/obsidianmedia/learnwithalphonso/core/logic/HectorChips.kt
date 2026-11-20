package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course

enum class HectorChipIcon { FLAME, COFFEE, BOOK, CHAT }

data class HectorChip(val id: String, val label: String, val message: String, val icon: HectorChipIcon)

/**
 * Suggestion chips under Hector's greeting: generated from the same context the greeting uses (the open weak spot, the
 * streak), with a fixed set when there is none. Tapping one sends its message as the learner's turn.
 *
 * Port of src/lib/hector-chips.ts and HectorChips.swift; shared/hector-chips.json holds the inputs and expected outputs
 * all three test suites replay. Chip text is English app copy; only the topic name inside a message is in the course language.
 */
object HectorChips {
    private val COFFEE = HectorChip("coffee", "Roleplay: ordering coffee", "Let's roleplay ordering coffee.", HectorChipIcon.COFFEE)
    private val EXPLAIN = HectorChip("explain", "Explain a rule", "Can you explain a grammar rule to me?", HectorChipIcon.BOOK)
    private val CHAT = HectorChip("chat", "Just chat", "Let's just chat.", HectorChipIcon.CHAT)
    private val WEAK_PLAIN = HectorChip("weakWords", "Practice my weak words", "Let's practice my weak words.", HectorChipIcon.FLAME)

    /** The set shown when there is no context. */
    val FALLBACK: List<HectorChip> = listOf(WEAK_PLAIN, COFFEE, EXPLAIN, CHAT)

    private val ROLEPLAYS: Map<String, HectorChip> = mapOf(
        "past-tense" to HectorChip("roleplay-weekend", "Roleplay: my weekend", "Let's roleplay: I tell you about my weekend.", HectorChipIcon.COFFEE),
        "prepositions" to HectorChip("roleplay-directions", "Roleplay: asking for directions", "Let's roleplay asking for directions.", HectorChipIcon.COFFEE),
        "question-formation" to HectorChip("roleplay-interview", "Roleplay: a job interview", "Let's roleplay a job interview.", HectorChipIcon.COFFEE),
        "modal-verbs" to HectorChip("roleplay-requests", "Roleplay: polite requests", "Let's roleplay making polite requests.", HectorChipIcon.COFFEE),
        "conditionals" to HectorChip("roleplay-trip", "Roleplay: planning a trip", "Let's roleplay planning a trip.", HectorChipIcon.COFFEE),
    )

    private const val MAX_CHIPS = 4

    fun build(course: Course, weakSpot: String?, streakDays: Int): List<HectorChip> {
        val topic = HectorGreeting.topicLabel(course, weakSpot)
        val out = mutableListOf<HectorChip>()
        if (topic != null) {
            out += WEAK_PLAIN.copy(message = "Let's practice $topic.")
            out += ROLEPLAYS[weakSpot!!.trim().lowercase()] ?: COFFEE
        }
        if (streakDays >= 2) {
            out += HectorChip("streak", "Keep my $streakDays-day streak", "Let's do a quick practice to keep my $streakDays-day streak going.", HectorChipIcon.FLAME)
        }
        if (out.isEmpty()) return FALLBACK
        for (c in listOf(COFFEE, EXPLAIN, CHAT)) {
            if (out.size >= MAX_CHIPS) break
            if (out.none { it.id == c.id }) out += c
        }
        return out.take(MAX_CHIPS)
    }
}
