import Foundation

/// iOS design-system theme sync (`profiles.theme`) -- in its own
/// extension file, not added to ProgressSyncClient.swift directly, same
/// merge-conflict-avoidance reasoning as ProgressSyncClient+Season.swift.
///
/// `profiles` never had its direct-write grant revoked the way the
/// gamification tables did (see ARCHITECTURE.md's database section) --
/// `GRANT INSERT, UPDATE ON public.profiles TO authenticated` plus an
/// own-row RLS policy (`profiles_update_own`) has been in place since
/// the table was created, the same policy the web's `updateProfile`
/// server function relies on (`supabase/migrations/
/// 20260725012934_...sql`, `.from("profiles").update(data).eq("id",
/// userId)` in `src/lib/leaderboard.functions.ts`). So this is a plain
/// PostgREST GET/PATCH, no RPC needed -- mirrors that same direct-write
/// pattern, just from Swift instead of the web server.
extension ProgressSyncClient {

/// Reads this user's saved theme, if any (`nil` covers both "no row
/// yet" and "theme column is null" -- both mean "use the local
/// default," same as `resolveInitialTheme`'s web-side fallback chain).
public func fetchProfileTheme(userID: String) async throws -> String? {
    var request = restRequest(path: "profiles", query: [
        URLQueryItem(name: "select", value: "theme"),
        URLQueryItem(name: "id", value: "eq.\(userID)"),
    ])
    request.httpMethod = "GET"
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
    guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
        throw ProgressSyncError.invalidPayload
    }
    return rows.first?["theme"] as? String
}

/// Persists a theme choice -- `theme` must already be one of
/// AlphonsoThemeID's raw values (the app-level `ThemePickerView` is the
/// only caller, so this doesn't re-validate against the enum itself,
/// same as this file not depending on any app-target type). The
/// `profiles_theme_check` CHECK constraint is the real backstop against
/// an invalid value regardless.
public func updateProfileTheme(_ theme: String, userID: String) async throws {
    var request = restRequest(path: "profiles", query: [
        URLQueryItem(name: "id", value: "eq.\(userID)"),
    ])
    request.httpMethod = "PATCH"
    request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["theme": theme])
    let (data, response) = try await requester(request)
    try Self.requireSuccess(data: data, response: response)
}

} // extension ProgressSyncClient
