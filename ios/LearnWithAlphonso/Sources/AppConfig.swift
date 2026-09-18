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
}
