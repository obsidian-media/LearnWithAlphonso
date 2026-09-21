import AuthenticationServices
import UIKit

enum GoogleSignInPresenterError: Error {
    case cancelled
}

/// Presents Supabase's Google OAuth authorize page in a system browser
/// sheet and returns the app's custom-scheme callback URL once the user
/// completes (or cancels) sign-in. Kept in the app target rather than
/// LearnWithAlphonsoKit because ASWebAuthenticationSession needs a real
/// window to anchor its presentation to.
@MainActor
final class GoogleSignInPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var activeSession: ASWebAuthenticationSession?

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    func authenticate(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { [weak self] callbackURL, error in
                self?.activeSession = nil
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                    return
                }
                if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
                    continuation.resume(throwing: GoogleSignInPresenterError.cancelled)
                    return
                }
                continuation.resume(throwing: error ?? URLError(.userAuthenticationRequired))
            }
            session.presentationContextProvider = self
            activeSession = session
            if !session.start() {
                activeSession = nil
                continuation.resume(throwing: URLError(.cannotConnectToHost))
            }
        }
    }
}
