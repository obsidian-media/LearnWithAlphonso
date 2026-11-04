import Foundation
import Sentry

/// Crash and error reporting (Sentry). Release builds only: Debug, simulator runs and CI never send.
///
/// Privacy, pinned by src/lib/ios-crash-reporting-guards.test.ts:
/// - the DSN is the PUBLIC iOS-project DSN (safe to ship; it can only submit events);
/// - no default PII, no user identity, no screenshots, no view hierarchy, no session replay;
/// - no tracing and no network breadcrumbs, so no URLs or request data leave the device;
/// - emails and tokens are scrubbed from whatever text remains before it is sent.
/// The manifest declares this as Crash Data, not linked to the user, not used for tracking
/// (PrivacyInfo.xcprivacy). dSYM upload needs an owner-created auth token and is documented, disabled,
/// in docs/sentry-crash-reporting.md.
enum CrashReporting {
    static let dsn = "https://7d3d682330a5a32778ff2d60788534f3@o4511662373273600.ingest.us.sentry.io/4512372763328514"

    static func start() {
        #if DEBUG
        return
        #else
        SentrySDK.start { options in
            options.dsn = dsn
            options.sendDefaultPii = false
            options.attachScreenshot = false
            options.attachViewHierarchy = false
            options.sessionReplay.sessionSampleRate = 0
            options.sessionReplay.onErrorSampleRate = 0
            options.tracesSampleRate = 0
            options.enableNetworkBreadcrumbs = false
            options.enableCaptureFailedRequests = false
            options.enableAutoSessionTracking = false
            options.beforeSend = { event in
                scrub(event)
            }
            options.beforeBreadcrumb = { crumb in
                crumb.message = crumb.message.map(scrubText)
                crumb.data = nil
                return crumb
            }
        }
        #endif
    }

    /// Removes identity and secrets from an outgoing event.
    static func scrub(_ event: Event) -> Event {
        event.user = nil
        event.exceptions?.forEach { $0.value = scrubText($0.value) }
        if let message = event.message {
            event.message = SentryMessage(formatted: scrubText(message.formatted))
        }
        return event
    }

    private static let patterns: [NSRegularExpression] = [
        // JWTs (Supabase access and refresh tokens): header.payload.signature, header and payload start "eyJ".
        try! NSRegularExpression(pattern: "eyJ[A-Za-z0-9_-]{5,}\\.eyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}"),
        try! NSRegularExpression(pattern: "(?i)bearer\\s+[A-Za-z0-9._~+/=-]{8,}"),
        try! NSRegularExpression(pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}"),
    ]

    /// Replaces every email address and token in `text` with `[redacted]`.
    static func scrubText(_ text: String) -> String {
        patterns.reduce(text) { partial, regex in
            regex.stringByReplacingMatches(
                in: partial,
                range: NSRange(partial.startIndex..., in: partial),
                withTemplate: "[redacted]"
            )
        }
    }
}
