package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import java.time.Instant
import java.time.ZoneOffset

enum class AiUsageState { OK, WARN, CAPPED }

/** What the Settings card draws. There is no field for money: the route never sends one and this has nowhere to carry it. */
data class AiUsageView(
    val state: AiUsageState,
    /** Whole percent, 0 to 100, clamped. */
    val percent: Int,
    /** The short state word, shown next to the meter so colour is never the only signal. */
    val label: String,
    /** One kind sentence about where they stand. */
    val message: String,
    /** Spoken value for the meter ("37 percent used, plenty left"). */
    val valueText: String,
    /** "Resets on 1 December", or the date-free fallback when the instant cannot be read. */
    val resetLine: String,
) {
    /** The note under the meter, as the web joins it: the sentence, "Lessons and review always work." when not ok, the reset. */
    val summary: String
        get() = listOfNotNull(message, if (state == AiUsageState.OK) null else AiUsageCopy.STILL_WORKS, "$resetLine.").joinToString(" ")
}

object AiUsageCopy {
    const val TITLE = "AI practice this month"

    /** Honest, plain: why a limit exists, that it resets, that normal use is nowhere near it. */
    const val EXPLAIN =
        "Heavy AI features, like Hector's voice calls and explanations, have a monthly limit that keeps the app sustainable. It resets every month, and normal use never reaches it."
    const val STILL_WORKS = "Lessons and review always work."
    const val RESET_FALLBACK = "Resets at the start of next month"

    fun label(s: AiUsageState): String = when (s) {
        AiUsageState.OK -> "Plenty left"
        AiUsageState.WARN -> "Getting close"
        AiUsageState.CAPPED -> "Limit reached"
    }

    fun message(s: AiUsageState): String = when (s) {
        AiUsageState.OK -> "You are well within this month's AI practice."
        AiUsageState.WARN -> "You have used most of this month's AI practice."
        AiUsageState.CAPPED -> "AI practice is paused for now."
    }
}

/**
 * The learner-facing view of `GET /api/ai-usage`, as pure functions. The app holds no limit and no dollar figure: the
 * route sends a state, a percent and a reset instant, and this turns them into words and a meter.
 *
 * Fail-safe: anything the route did not promise (unknown state, missing or odd fields, a failed call) is null, which the
 * screen draws as nothing. Our own read error is never shown to the learner as a scare.
 *
 * Port of src/lib/ai-usage-view.ts and AiUsage.swift; keep the three in step.
 */
object AiUsage {
    private val MONTHS = listOf(
        "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
    )

    /** "1 December" for the instant, in UTC like the server's month; null when it cannot be read. */
    fun resetDateLabel(resetsAt: String): String? {
        val instant = runCatching { Instant.parse(resetsAt) }.getOrNull() ?: return null
        val d = instant.atZone(ZoneOffset.UTC)
        return "${d.dayOfMonth} ${MONTHS[d.monthValue - 1]}"
    }

    /** Maps the route's answer. Anything unknown or malformed is null. */
    fun parse(body: String): AiUsageView? {
        val obj = runCatching { Json.parseToJsonElement(body) as? JsonObject }.getOrNull() ?: return null
        val state = when ((obj["state"] as? JsonPrimitive)?.takeIf { it.isString }?.content) {
            "ok" -> AiUsageState.OK
            "warn" -> AiUsageState.WARN
            "capped" -> AiUsageState.CAPPED
            else -> return null
        }
        val n = (obj["percentUsed"] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull ?: return null
        if (!n.isFinite()) return null
        // A capped learner is always at the end of the meter, whatever the number says.
        val percent = if (state == AiUsageState.CAPPED) 100 else Math.floor(n).coerceIn(0.0, 100.0).toInt()
        val date = (obj["resetsAt"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.let(::resetDateLabel)
        val label = AiUsageCopy.label(state)
        return AiUsageView(
            state = state,
            percent = percent,
            label = label,
            message = AiUsageCopy.message(state),
            valueText = "$percent percent used, ${label.lowercase()}",
            resetLine = date?.let { "Resets on $it" } ?: AiUsageCopy.RESET_FALLBACK,
        )
    }
}
