import AuthenticationServices
import CryptoKit
import UIKit

enum AppleSignInPresenterError: Error {
    case cancelled
    case missingIdentityToken
}

/// What ASAuthorizationController hands back once the user completes native
/// Sign in with Apple. `email`/`fullName` are only non-nil on this device's
/// *first ever* authorization for this app (or after the user revokes and
/// re-grants access in Settings) -- Apple's documented behavior, not a bug
/// here; the identity token itself carries the user's email (including a
/// private-relay address) on every sign-in regardless, which is what
/// Supabase actually uses. `identityToken`/`rawNonce` are what
/// SupabaseAuthClient.signInWithIDToken needs; `authorizationCode` is the
/// short-lived (~5 minute) one-time code Apple's own `/auth/revoke`
/// endpoint would need, server-side, to revoke this authorization later --
/// see Session.appleAuthorizationCodeForRevocation.
struct AppleSignInResult {
    let identityToken: String
    let rawNonce: String
    let authorizationCode: String?
    let email: String?
    let fullName: PersonNameComponents?
}

/// Presents Apple's native Sign in with Apple sheet (ASAuthorizationController)
/// and returns the resulting identity token. Kept in the app target rather
/// than LearnWithAlphonsoKit for the same reason as GoogleSignInPresenter:
/// ASAuthorizationController needs a real window to anchor its presentation
/// to. Unlike Google's flow, this never opens a browser -- Apple's own
/// system UI handles the whole interaction, so there is no callback URL to
/// capture; the delegate callbacks below hand back the result directly.
@MainActor
final class AppleSignInPresenter: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<AppleSignInResult, Error>?
    private var currentNonce: String?

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    func authenticate() async throws -> AppleSignInResult {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation

            let rawNonce = Self.randomNonceString()
            currentNonce = rawNonce

            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            // GoTrue hashes whatever raw nonce it's given and compares it
            // to this token's nonce claim -- so the *hashed* value goes to
            // Apple here, and the *raw* value goes to Supabase later. See
            // SupabaseAuthClient.signInWithIDToken's doc comment.
            request.nonce = Self.sha256Hex(rawNonce)

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { continuation = nil }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8),
              let rawNonce = currentNonce else {
            continuation?.resume(throwing: AppleSignInPresenterError.missingIdentityToken)
            return
        }
        let authorizationCode = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        continuation?.resume(returning: AppleSignInResult(
            identityToken: identityToken,
            rawNonce: rawNonce,
            authorizationCode: authorizationCode,
            email: credential.email,
            fullName: credential.fullName
        ))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { continuation = nil }
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            continuation?.resume(throwing: AppleSignInPresenterError.cancelled)
            return
        }
        continuation?.resume(throwing: error)
    }

    /// Apple's documented recipe (developer.apple.com/documentation/
    /// sign_in_with_apple/implementing_user_authentication_with_sign_in_with_apple):
    /// a cryptographically random string, hashed with SHA-256 before it's
    /// set on the request's `nonce`. The *raw* string (not this hash) is
    /// what gets sent on to Supabase, which does its own SHA-256 of it to
    /// verify against the identity token's `nonce` claim.
    private static func randomNonceString(length: Int = 32) -> String {
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remainingLength = length
        while remainingLength > 0 {
            var randoms = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
            precondition(status == errSecSuccess)
            for random in randoms where remainingLength > 0 {
                if random < charset.count {
                    result.append(charset[Int(random)])
                    remainingLength -= 1
                }
            }
        }
        return result
    }

    private static func sha256Hex(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).compactMap { String(format: "%02x", $0) }.joined()
    }
}
