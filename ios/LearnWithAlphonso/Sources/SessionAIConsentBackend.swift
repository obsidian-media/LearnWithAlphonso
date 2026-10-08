import Foundation
import LearnWithAlphonsoKit

/// The app's AIConsentBackend: the signed-in Session and the consent RPCs (ProgressSyncClient+AIConsent).
@MainActor
final class SessionAIConsentBackend: AIConsentBackend {
    private let session: Session

    init(session: Session) {
        self.session = session
    }

    func currentUserID() -> String? { session.userID }

    func fetchConsent() async throws -> Date? {
        try await client().fetchAIConsent()
    }

    func setConsent(_ granted: Bool) async throws -> Date? {
        try await client().setAIConsent(granted)
    }

    private func client() async throws -> ProgressSyncClient {
        guard let token = await session.freshAccessToken() else { throw AIConsentError.signedOut }
        return ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL,
            anonKey: AppConfig.supabasePublishableKey,
            accessToken: token)
    }
}
