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
        // Stable per-install identifiers would make a report linkable to one device, and so to a person.
        event.serverName = nil
        if var app = event.context?["app"] {
            app["device_app_hash"] = nil
            event.context?["app"] = app
        }
        if var device = event.context?["device"] {
            for key in ["id", "name", "device_unique_identifier"] { device[key] = nil }
            event.context?["device"] = device
        }
        event.exceptions?.forEach { $0.value = $0.value.map(scrubText) }
        if let message = event.message {
            event.message = SentryMessage(formatted: scrubText(message.formatted))
        }
        return event
    }

    /// Sensitive URL query and fragment parameters: the value goes, the name stays (template $1$2=[redacted]).
    private static let sensitiveParameter = try! NSRegularExpression(
        pattern: "(?i)([?&#;])(access_token|refresh_token|id_token|token|token_hash|code|apikey|api_key|key|email|password|secret|otp|session|state)=[^&#\\s]*"
    )

    private static let patterns: [NSRegularExpression] = [
        // Secret key formats.
        try! NSRegularExpression(pattern: "(sb_secret|sb_publishable|sk_live|sk_test|rk_live|pk_live)_[A-Za-z0-9_-]{8,}"),
        // Account ids: Supabase filters look like user_id=eq.<uuid>.
        try! NSRegularExpression(pattern: "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"),
        // JWTs (Supabase access and refresh tokens): header.payload.signature, header and payload start "eyJ".
        try! NSRegularExpression(pattern: "eyJ[A-Za-z0-9_-]{5,}\\.eyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}"),
        try! NSRegularExpression(pattern: "(?i)bearer\\s+[A-Za-z0-9._~+/=-]{8,}"),
        try! NSRegularExpression(pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}"),
    ]

    /// Replaces every email address and token in `text` with `[redacted]`.
    static func scrubText(_ text: String) -> String {
        let withoutParameters = sensitiveParameter.stringByReplacingMatches(
            in: text,
            range: NSRange(text.startIndex..., in: text),
            withTemplate: "$1$2=[redacted]"
        )
        return patterns.reduce(withoutParameters) { partial, regex in
            regex.stringByReplacingMatches(
                in: partial,
                range: NSRange(partial.startIndex..., in: partial),
                withTemplate: "[redacted]"
            )
        }
    }
}
