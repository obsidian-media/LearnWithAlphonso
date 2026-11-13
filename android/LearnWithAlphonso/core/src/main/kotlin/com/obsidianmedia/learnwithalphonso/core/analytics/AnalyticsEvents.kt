package com.obsidianmedia.learnwithalphonso.core.analytics

/**
 * The whole analytics vocabulary, the same list as the web analytics-events.ts and the iOS AnalyticsEvents.swift;
 * src/lib/analytics-parity.test.ts fails if the three drift.
 *
 * Privacy by construction: an event may carry only the properties listed in [AnalyticsEvent.allowed], and a value is
 * kept only if it looks like a short identifier (content ids, level codes, source names) or a small number. Anything
 * else, an email, a typed answer, a chat line, is dropped before it reaches the SDK. Never add a free-text property.
 */
enum class AnalyticsEvent(val wire: String, val allowed: Map<String, PropertyKind>) {
    APP_OPEN("app_open", emptyMap()),
    ONBOARDING_STEP("onboarding_step", mapOf("step" to PropertyKind.IDENTIFIER)),
    SIGN_IN_COMPLETED("sign_in_completed", mapOf("method" to PropertyKind.IDENTIFIER)),
    LESSON_STARTED(
        "lesson_started",
        mapOf("lesson_id" to PropertyKind.IDENTIFIER, "level" to PropertyKind.IDENTIFIER, "course" to PropertyKind.IDENTIFIER),
    ),
    LESSON_COMPLETED(
        "lesson_completed",
        mapOf(
            "lesson_id" to PropertyKind.IDENTIFIER,
            "level" to PropertyKind.IDENTIFIER,
            "course" to PropertyKind.IDENTIFIER,
            "score_bucket" to PropertyKind.IDENTIFIER,
        ),
    ),
    PRACTICE_CALL_STARTED("practice_call_started", mapOf("scenario_id" to PropertyKind.IDENTIFIER)),
    PRACTICE_CALL_COMPLETED(
        "practice_call_completed",
        mapOf("scenario_id" to PropertyKind.IDENTIFIER, "stars" to PropertyKind.NUMBER),
    ),
    PODCAST_PLAYED("podcast_played", mapOf("episode_id" to PropertyKind.IDENTIFIER, "course" to PropertyKind.IDENTIFIER)),
    PODCAST_COMPLETED("podcast_completed", mapOf("episode_id" to PropertyKind.IDENTIFIER, "course" to PropertyKind.IDENTIFIER)),
    HECTOR_OPENED("hector_opened", emptyMap()),
    PAYWALL_VIEWED("paywall_viewed", mapOf("source" to PropertyKind.IDENTIFIER)),
    PURCHASE_STARTED("purchase_started", mapOf("source" to PropertyKind.IDENTIFIER)),
    EXPLAIN_REQUESTED("explain_requested", mapOf("source" to PropertyKind.IDENTIFIER)),
    PATH_BUILT("path_built", mapOf("course" to PropertyKind.IDENTIFIER)),
}

enum class PropertyKind { IDENTIFIER, NUMBER }

object AnalyticsProperties {
    /** A short identifier: letters, digits and _ . : + - only. No spaces and no at sign, so no sentence and no email. */
    const val IDENTIFIER_PATTERN = "^[A-Za-z0-9_.:+-]{1,64}$"
    private val identifier = Regex(IDENTIFIER_PATTERN)

    /** 0-49, 50-79, 80-99 or 100: a bucket, never the raw score. */
    fun scoreBucket(percent: Double): String = when {
        percent.isNaN() || percent.isInfinite() -> "0-49"
        percent >= 100 -> "100"
        percent >= 80 -> "80-99"
        percent >= 50 -> "50-79"
        else -> "0-49"
    }

    /** Keeps only the allowed keys of [event] whose values pass; everything else is dropped. */
    fun sanitize(event: AnalyticsEvent, properties: Map<String, Any?>): Map<String, Any> {
        val out = LinkedHashMap<String, Any>()
        for ((key, kind) in event.allowed) {
            val value = properties[key]
            when (kind) {
                PropertyKind.IDENTIFIER -> if (value is String && identifier.matches(value)) out[key] = value
                PropertyKind.NUMBER -> if (value is Int && value in 0..100) out[key] = value
            }
        }
        return out
    }
}
