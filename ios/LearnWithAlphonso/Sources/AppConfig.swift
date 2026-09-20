import Foundation

/// Publishable/anon keys are meant to ship inside client apps (Supabase's
/// own docs: they're safe to embed, RLS is the real boundary) -- unlike
/// SUPABASE_SERVICE_ROLE_KEY, which must never appear here. Points at the
/// same Supabase project english-buddy-app-33's web app already uses (see
/// the native app design doc's architecture section: one account, shared
/// backend, no migration).
enum AppConfig {
    static let supabaseURL = URL(string: "https://qhcjpfbxfcltjbiuknyt.supabase.co")!
    static let supabasePublishableKey = "sb_publishable_mIBGe0mIBTz---kX-vP59A_x0UhYbs9"

    /// This repo's own deployed web app -- AIConversationClient calls its
    /// /api/chat, /api/tts, /api/stt routes directly (see that type's doc
    /// comment for why: same backend the web app already uses, no second
    /// account system).
    static let apiBaseURL = URL(string: "https://english-buddy-app-33.vercel.app")!

    /// AlphonsoCompanion's Cloud Voice backend -- a genuinely separate
    /// account system (its own Supabase project, its own email-OTP
    /// sign-in) that only the Pro "Hector" mode uses. Values read directly
    /// from AlphonsoCompanion's own working Info.plist
    /// (AlphonsoEcosystem/ios/AlphonsoCompanion/AlphonsoCompanion/Info.plist)
    /// -- same publishable-key-is-safe-to-embed reasoning as supabaseURL
    /// above, just a different project.
    static let cloudVoiceSupabaseURL = URL(string: "https://ywavjlmjbxuslbxactsx.supabase.co")!
    static let cloudVoiceSupabasePublishableKey = "sb_publishable__PzRloOOxtW8nQjfysRm0w_5oHkuERj"
    static let cloudVoiceRespondEndpoint = URL(string: "https://voice.obsidianmedia.online/v1/voice/respond")!

    /// RevenueCat's *public* SDK key -- meant to ship inside client apps
    /// (same publishable-key model as Supabase's, not a secret; RevenueCat's
    /// secret/server API key is a different, sk_-prefixed value that must
    /// never appear here). Read from the generated Info.plist's `RCApiKey`
    /// entry rather than a Swift literal, so swapping test -> production is
    /// a build-setting change (project.yml's per-config `INFOPLIST_KEY_RCApiKey`,
    /// or the REVENUECAT_API_KEY repo secret ios-release.yml's archive step
    /// injects for Release) instead of an app-code edit. nil when unset --
    /// e.g. a Release archive built before a real production key secret
    /// exists -- which every `Purchases.shared` call site must treat as
    /// "Pro purchases unavailable this launch," not a crash: RevenueCat's
    /// SDK itself hard-crashes on launch if a Test Store key reaches a
    /// TestFlight/App-Store-distributed build (a real crash this exact
    /// setup caused, see the 2026-09-19 TestFlight crash report), so this
    /// must never fall back to the Debug/Test Store key when unset.
    static let revenueCatAPIKey: String? = {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "RCApiKey") as? String,
            !value.isEmpty
        else { return nil }
        return value
    }()

    /// The RevenueCat Entitlement identifier (RevenueCat dashboard ->
    /// Entitlements) that gates Hector -- see EntitlementStore.swift.
    static let proEntitlementID = "pro"
}
