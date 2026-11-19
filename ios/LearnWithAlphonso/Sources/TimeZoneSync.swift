import Foundation
import LearnWithAlphonsoKit

/// Tells the server the device's time zone so streaks and daily goals follow the learner's local day. Silent on any
/// failure; TimeZoneReporter remembers the last zone sent per account, and the token is only fetched when it changed.
enum TimeZoneSync {
    @MainActor
    static func run(session: Session) async {
        guard let userID = session.userID, !FirstRunDevice.isBlocked else { return }
        await TimeZoneReporter().syncIfChanged(userID: userID, zone: TimeZone.current.identifier) { zone in
            guard let token = await session.freshAccessToken() else { throw SupabaseAuthError.invalidPayload }
            try await ProgressSyncClient(
                supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token
            ).setMyTimeZone(zone)
        }
    }
}
