package com.obsidianmedia.learnwithalphonso.core.analytics

/** Where an event finally goes. The app implements it over PostHog; tests use a recording fake. */
interface AnalyticsSink {
    fun capture(event: String, properties: Map<String, Any>)

    /** Forgets the anonymous id and anything queued (the learner turned sharing off). */
    fun reset()
}

/** One string, kept on this device: "1" opted in, "0" opted out, absent means not asked yet. */
interface AnalyticsConsentStorage {
    fun read(): String?
    fun write(value: String)
}

/**
 * Optional usage analytics, strictly opt-in, the same rules as the web analytics.ts and the iOS AnalyticsTracker:
 * - nothing reaches the sink, and the sink is never built, until the learner opts in (first-sign-in choice or Settings);
 * - turning it off stops sending at once and resets the anonymous id;
 * - never on a device that answered Under 13, even with a stored opt-in;
 * - anonymous only (no email, name, account id), and only the allow-listed properties.
 */
class AnalyticsTracker(
    private val storage: AnalyticsConsentStorage,
    private val isUnder13: () -> Boolean,
    private val platform: String = "android",
) {
    private var sink: AnalyticsSink? = null
    private val lock = Any()

    /** True only for an explicit opt-in on a device that is not Under 13. */
    val hasConsent: Boolean get() = !isUnder13() && storage.read() == "1"

    /** Whether the learner has been asked yet (either answer). */
    val hasAnswered: Boolean get() = storage.read() != null

    /** [makeSink] runs only when consent is on, so the SDK is never created before it. */
    fun setConsent(on: Boolean, makeSink: () -> AnalyticsSink?) {
        storage.write(if (on) "1" else "0")
        synchronized(lock) {
            if (on) {
                if (sink == null && !isUnder13()) sink = makeSink()
            } else {
                sink?.reset()
                sink = null
            }
        }
    }

    /** At launch: starts the sink if consent was already given. */
    fun resume(makeSink: () -> AnalyticsSink?) {
        if (!hasConsent) return
        synchronized(lock) { if (sink == null) sink = makeSink() }
    }

    fun track(event: AnalyticsEvent, properties: Map<String, Any?> = emptyMap()) {
        if (!hasConsent) return
        val current = synchronized(lock) { sink } ?: return
        current.capture(event.wire, AnalyticsProperties.sanitize(event, properties) + ("platform" to platform))
    }
}
