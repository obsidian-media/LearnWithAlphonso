package com.obsidianmedia.learnwithalphonso

import android.content.Context
import android.content.SharedPreferences
import com.obsidianmedia.learnwithalphonso.core.analytics.AnalyticsConsentStorage
import com.obsidianmedia.learnwithalphonso.core.analytics.AnalyticsEvent
import com.obsidianmedia.learnwithalphonso.core.analytics.AnalyticsSink
import com.obsidianmedia.learnwithalphonso.core.analytics.AnalyticsTracker
import com.obsidianmedia.learnwithalphonso.firstrun.FirstRunDevice
import com.posthog.PersonProfiles
import com.posthog.PostHog
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig

/**
 * Optional usage analytics (PostHog, US cloud). Strictly opt-in; the rules live in the core AnalyticsTracker (tested
 * there) and are pinned by src/lib/analytics-parity.test.ts, the same as the web and iOS:
 * - nothing is created, started or sent until the learner opts in (the first-sign-in step or Settings);
 * - turning it off resets the anonymous id and stops sending at once;
 * - never on a device that answered Under 13;
 * - anonymous only: identify() is never called, so no email, name or account id; only the allow-listed properties of
 *   AnalyticsEvent, never a typed answer, chat or audio;
 * - no screen-view or lifecycle capture, no deep links, no session replay, no surveys, no feature flags.
 * The project key is a build-time value (BuildConfig.POSTHOG_PROJECT_KEY, from the POSTHOG_PROJECT_KEY secret in
 * android-release.yml); when it is blank the whole feature is off and its screens are hidden.
 */
object Analytics {
    const val HOST = "https://us.i.posthog.com"

    @Volatile private var appContext: Context? = null
    @Volatile private var tracker: AnalyticsTracker? = null

    /** False when this build has no key: no consent screen, no Settings switch, nothing sent. */
    val isAvailable: Boolean get() = BuildConfig.POSTHOG_PROJECT_KEY.isNotBlank() && !FirstRunDevice.isBlocked

    val hasConsent: Boolean get() = tracker?.hasConsent == true
    val hasAnswered: Boolean get() = tracker?.hasAnswered == true

    /** In AlphonsoApplication.onCreate, after FirstRunDevice.init: starts the SDK only if the learner already opted in. */
    fun init(context: Context) {
        if (tracker != null) return
        val app = context.applicationContext
        appContext = app
        val created = AnalyticsTracker(
            storage = PrefsConsent(app.getSharedPreferences("alphonso.analytics", Context.MODE_PRIVATE)),
            isUnder13 = { FirstRunDevice.isBlocked },
        )
        tracker = created
        created.resume(::makeSink)
    }

    fun setConsent(on: Boolean) {
        tracker?.setConsent(on, ::makeSink)
    }

    fun track(event: AnalyticsEvent, properties: Map<String, Any?> = emptyMap()) {
        tracker?.track(event, properties)
    }

    private fun makeSink(): AnalyticsSink? {
        val context = appContext ?: return null
        val key = BuildConfig.POSTHOG_PROJECT_KEY.trim()
        if (key.isEmpty()) return null
        return PostHogSink(context, key)
    }
}

private class PrefsConsent(private val prefs: SharedPreferences) : AnalyticsConsentStorage {
    override fun read(): String? = prefs.getString(KEY, null)
    override fun write(value: String) {
        prefs.edit().putString(KEY, value).apply()
    }

    private companion object {
        const val KEY = "lwa.analytics-consent.v1"
    }
}

private class PostHogSink(context: Context, key: String) : AnalyticsSink {
    init {
        val config = PostHogAndroidConfig(projectToken = key, host = Analytics.HOST).apply {
            captureApplicationLifecycleEvents = false
            captureDeepLinks = false
            captureScreenViews = false
            capturePushNotificationSubscriptions = false
            capturePushNotificationOpened = false
            preloadFeatureFlags = false
            sendFeatureFlagEvent = false
            personProfiles = PersonProfiles.NEVER
            surveys = false
        }
        PostHogAndroid.setup(context, config)
        // An earlier opt-out is persisted by the SDK: this sink exists only because the learner opted in again.
        PostHog.optIn()
    }

    override fun capture(event: String, properties: Map<String, Any>) {
        PostHog.capture(event = event, properties = properties)
    }

    override fun reset() {
        PostHog.reset()
        PostHog.optOut()
    }
}
