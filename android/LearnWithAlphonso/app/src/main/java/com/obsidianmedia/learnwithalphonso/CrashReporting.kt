package com.obsidianmedia.learnwithalphonso

import android.content.Context
import com.obsidianmedia.learnwithalphonso.firstrun.FirstRunDevice
import io.sentry.Breadcrumb
import io.sentry.Sentry
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
        // A device that answered Under 13 never starts reporting (the first run's block).
        if (FirstRunDevice.isBlocked) return
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
        // Started before the block (Under 13 chosen in this launch): nothing more is sent or kept.
        options.beforeSend = SentryOptions.BeforeSendCallback { event, _ -> if (FirstRunDevice.isBlocked) null else scrub(event) }
        options.beforeBreadcrumb = SentryOptions.BeforeBreadcrumbCallback { crumb, _ -> if (FirstRunDevice.isBlocked) null else scrub(crumb) }
    }

    /** Under 13 was just chosen: close the client so nothing queued is sent. */
    fun stop() {
        runCatching { Sentry.close() }
    }

    fun scrub(event: SentryEvent): SentryEvent {
        event.user = null
        // Stable per-install identifiers would make a report linkable to one device, and so to a person.
        event.serverName = null
        event.contexts.device?.id = null
        event.contexts.device?.name = null
        event.contexts.app?.deviceAppHash = null
        event.exceptions?.forEach { exception -> exception.value = exception.value?.let(::scrubText) }
        event.message?.let { message -> message.formatted = message.formatted?.let(::scrubText) }
        return event
    }

    fun scrub(crumb: Breadcrumb): Breadcrumb {
        crumb.message = crumb.message?.let(::scrubText)
        crumb.data.keys.toList().forEach { crumb.removeData(it) }
        return crumb
    }

    /** Sensitive URL query and fragment parameters: the value goes, the name stays. */
    private val sensitiveParameter = Regex(
        "(?i)([?&#;])(access_token|refresh_token|id_token|token|token_hash|code|apikey|api_key|key|email|password|secret|otp|session|state)=[^&#\\s]*",
    )

    private val patterns = listOf(
        // Secret key formats.
        Regex("(sb_secret|sb_publishable|sk_live|sk_test|rk_live|pk_live)_[A-Za-z0-9_-]{8,}"),
        // Account ids: Supabase filters look like user_id=eq.<uuid>.
        Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"),
        // JWTs (Supabase access and refresh tokens): header.payload.signature, header and payload start "eyJ".
        Regex("eyJ[A-Za-z0-9_-]{5,}\\.eyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}"),
        Regex("(?i)bearer\\s+[A-Za-z0-9._~+/=-]{8,}"),
        Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}"),
    )

    /** Replaces every email address and token in [text] with `[redacted]`. */
    fun scrubText(text: String): String =
        patterns.fold(sensitiveParameter.replace(text, "$1$2=[redacted]")) { acc, regex ->
            regex.replace(acc, "[redacted]")
        }
}
