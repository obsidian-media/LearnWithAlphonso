package com.obsidianmedia.learnwithalphonso

import android.content.Context
import io.sentry.Breadcrumb
import io.sentry.SentryEvent
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid
import io.sentry.android.core.SentryAndroidOptions

/**
 * Crash and error reporting (Sentry). Release builds only: debug builds, CI and unit tests never send.
 *
 * Privacy, the same as iOS and pinned by CrashReportingTest:
 * - the DSN is the PUBLIC Android-project DSN (safe to ship; it can only submit events);
 * - no default PII, no user identity, no screenshots, no view hierarchy, no session replay;
 * - no tracing, no sessions, no network breadcrumbs, no user-interaction breadcrumbs;
 * - emails and tokens are scrubbed from the text that remains before it is sent.
 * Play data safety lists this as crash logs and diagnostics, not linked to the user
 * (play/data-safety.md). Mapping-file upload needs an owner-created auth token and is documented, disabled,
 * in docs/sentry-crash-reporting.md.
 */
object CrashReporting {
    const val DSN =
        "https://b6dd7da7987cc485a8f020a4a80ae6f5@o4511662373273600.ingest.us.sentry.io/4512372763328512"

    fun start(context: Context) {
        if (BuildConfig.DEBUG) return
        SentryAndroid.init(context) { options -> configure(options) }
    }

    /** Pure configuration, separate from [start] so a JVM test can check every setting. */
    fun configure(options: SentryAndroidOptions) {
        options.dsn = DSN
        options.isSendDefaultPii = false
        options.isAttachScreenshot = false
        options.isAttachViewHierarchy = false
        options.sessionReplay.sessionSampleRate = 0.0
        options.sessionReplay.onErrorSampleRate = 0.0
        options.tracesSampleRate = 0.0
        options.isEnableAutoSessionTracking = false
        options.isEnableUserInteractionBreadcrumbs = false
        options.isEnableUserInteractionTracing = false
        options.isEnableNetworkEventBreadcrumbs = false
        options.beforeSend = SentryOptions.BeforeSendCallback { event, _ -> scrub(event) }
        options.beforeBreadcrumb = SentryOptions.BeforeBreadcrumbCallback { crumb, _ -> scrub(crumb) }
    }

    fun scrub(event: SentryEvent): SentryEvent {
        event.user = null
        event.exceptions?.forEach { exception -> exception.value = exception.value?.let(::scrubText) }
        event.message?.let { message -> message.formatted = message.formatted?.let(::scrubText) }
        return event
    }

    fun scrub(crumb: Breadcrumb): Breadcrumb {
        crumb.message = crumb.message?.let(::scrubText)
        crumb.data.keys.toList().forEach { crumb.removeData(it) }
        return crumb
    }

    private val patterns = listOf(
        // JWTs (Supabase access and refresh tokens): header.payload.signature, header and payload start "eyJ".
        Regex("eyJ[A-Za-z0-9_-]{5,}\\.eyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}"),
        Regex("(?i)bearer\\s+[A-Za-z0-9._~+/=-]{8,}"),
        Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}"),
    )

    /** Replaces every email address and token in [text] with `[redacted]`. */
    fun scrubText(text: String): String = patterns.fold(text) { acc, regex -> regex.replace(acc, "[redacted]") }
}
