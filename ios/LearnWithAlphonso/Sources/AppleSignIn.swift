import AuthenticationServices
import CryptoKit
import Foundation
import LearnWithAlphonsoKit

enum AppleSignInError: Error {
    case missingIdentityToken
    case noRequestInFlight
}

/// What a completed native Sign in with Apple hands back. `givenName` (and the email) are only non-nil on this
/// device's first ever authorization for this app (Apple's documented behaviour), which is why Session saves
/// the given name immediately. `appleUserID` (credential.user) is stable per app and Apple ID, and is what
/// getCredentialState needs. `authorizationCode` is the short-lived code /api/apple-link exchanges
/// server-side so account deletion can revoke the grant.
struct AppleSignInResult {
    let identityToken: String
    let rawNonce: String
    let authorizationCode: String?
    let appleUserID: String
    let givenName: String?
}

/// SignInWithAppleButton presents Apple's sheet itself (the system button, not a look-alike), so this only
/// prepares each request and parses the result.
///
/// GoTrue hashes whatever raw nonce it is given and compares it to the identity token's nonce claim, so the
/// HASHED value goes to Apple here and the RAW value goes to Supabase (SupabaseAuthClient.signInWithIDToken).
@MainActor
final class AppleSignInCoordinator {
    private var rawNonce: String?

    func prepare(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonceString()
        rawNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256Hex(nonce)
    }

    func result(from authorization: ASAuthorization) throws -> AppleSignInResult {
        defer { rawNonce = nil }
        guard let rawNonce else { throw AppleSignInError.noRequestInFlight }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            throw AppleSignInError.missingIdentityToken
        }
        let given = credential.fullName?.givenName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return AppleSignInResult(
            identityToken: identityToken,
            rawNonce: rawNonce,
            authorizationCode: credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) },
            appleUserID: credential.user,
            givenName: (given?.isEmpty ?? true) ? nil : given
        )
    }

    static func isCancellation(_ error: Error) -> Bool {
        (error as? ASAuthorizationError)?.code == .canceled
    }

    /// Apple's documented recipe: a cryptographically random string, hashed with SHA-256 for the request.
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

/// The system's current view of this app's Apple ID authorization.
enum AppleCredentialStateReader {
    static func status(forAppleUserID appleUserID: String) async -> AppleCredentialStatus {
        await withCheckedContinuation { continuation in
            ASAuthorizationAppleIDProvider().getCredentialState(forUserID: appleUserID) { state, error in
                guard error == nil else {
                    continuation.resume(returning: .unknown)
                    return
                }
                switch state {
                case .authorized: continuation.resume(returning: .authorized)
                case .revoked: continuation.resume(returning: .revoked)
                case .notFound: continuation.resume(returning: .notFound)
                case .transferred: continuation.resume(returning: .transferred)
                @unknown default: continuation.resume(returning: .unknown)
                }
            }
        }
    }
}
