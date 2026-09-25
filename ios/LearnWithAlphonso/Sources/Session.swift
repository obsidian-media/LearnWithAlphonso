import Foundation
import Observation
import LearnWithAlphonsoKit

/// App-wide auth state, driving which root view (AuthView vs. the signed-in
/// app) is shown. In-memory only for this first scaffold slice -- no
/// Keychain persistence yet, so the app re-prompts for sign-in on every
/// cold launch. A real app ships with session persistence before
/// submission; tracked as follow-up, not silently skipped.
@Observable
@MainActor
final class Session {
    enum AuthState: Equatable {
        case signedOut
        case awaitingCode(email: String)
        case signedIn(SupabaseSession)
    }

    private(set) var state: AuthState = .signedOut
    private(set) var errorMessage: String?
    private(set) var isBusy = false

    private let authClient: SupabaseAuthClient
    private let googleSignInPresenter = GoogleSignInPresenter()
    private let appleSignInPresenter = AppleSignInPresenter()

    /// Set right after a successful Apple sign-in; cleared on sign-out.
    /// Apple's revoke endpoint (required on account deletion, per App
    /// Store Guideline 5.1.1(v)) needs a client_secret signed with the
    /// Sign in with Apple private key -- that must never ship in this app,
    /// so revocation itself can only happen server-side. This just
    /// captures the one-time authorization code (valid for a few minutes)
    /// while it's still fresh, so an account-deletion flow started in the
    /// same session can forward it to a server-side revoke step. It does
    /// NOT survive relaunch, and no server-side revoke step exists yet --
    /// see this PR's description for what's still needed.
    private(set) var appleAuthorizationCodeForRevocation: String?

    init(authClient: SupabaseAuthClient = SupabaseAuthClient(
        supabaseURL: AppConfig.supabaseURL,
        publishableKey: AppConfig.supabasePublishableKey
    )) {
        self.authClient = authClient
    }

    var accessToken: String? {
        if case .signedIn(let session) = state { return session.accessToken }
        return nil
    }

    /// The signed-in user's own id -- for anything that needs to reference
    /// "me" client-side (building an invite link, comparing a leaderboard
    /// row to "is this me"). See SupabaseSession.userID's doc comment.
    var userID: String? {
        if case .signedIn(let session) = state { return session.userID }
        return nil
    }

    func requestCode(email: String) async {
        errorMessage = nil
        isBusy = true
        defer { isBusy = false }
        do {
            try await authClient.requestEmailOTP(email: email)
            state = .awaitingCode(email: email)
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    func verifyCode(_ code: String) async {
        guard case .awaitingCode(let email) = state else { return }
        errorMessage = nil
        isBusy = true
        defer { isBusy = false }
        do {
            let session = try await authClient.verifyEmailOTP(email: email, code: code)
            state = .signedIn(session)
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    /// Signs in through the *same* Google OAuth client Supabase already
    /// has configured for the web app (Authentication > Providers >
    /// Google) -- no separate Google Cloud Console credentials for iOS.
    /// Opens a system browser sheet (ASWebAuthenticationSession) for the
    /// actual Google consent screen, then completes Supabase's PKCE
    /// exchange once it redirects back to this app's custom URL scheme.
    func signInWithGoogle() async {
        errorMessage = nil
        isBusy = true
        defer { isBusy = false }
        do {
            let challenge = SupabaseOAuthFlow.makePKCEChallenge()
            let authorizeURL = SupabaseOAuthFlow.authorizeURL(
                supabaseURL: AppConfig.supabaseURL,
                redirectTo: AppConfig.googleSignInRedirectURL,
                challenge: challenge
            )
            let callbackURL = try await googleSignInPresenter.authenticate(
                url: authorizeURL,
                callbackScheme: AppConfig.googleSignInURLScheme
            )
            guard let code = SupabaseOAuthFlow.authorizationCode(from: callbackURL) else {
                errorMessage = "Google sign-in didn't complete. Please try again."
                return
            }
            let session = try await authClient.exchangeOAuthCode(code, codeVerifier: challenge.verifier)
            state = .signedIn(session)
        } catch GoogleSignInPresenterError.cancelled {
            // The user dismissed the sheet -- not a real error.
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    /// Signs in with the system Apple ID dialog (ASAuthorizationController)
    /// and completes Supabase's native id_token exchange -- no browser
    /// sheet, unlike Google's flow above. Required alongside Google per
    /// App Store Guideline 4.8: an app offering a third-party social login
    /// must also offer Sign in with Apple.
    func signInWithApple() async {
        errorMessage = nil
        isBusy = true
        defer { isBusy = false }
        do {
            let result = try await appleSignInPresenter.authenticate()
            let session = try await authClient.signInWithIDToken(
                provider: "apple",
                idToken: result.identityToken,
                nonce: result.rawNonce
            )
            appleAuthorizationCodeForRevocation = result.authorizationCode
            state = .signedIn(session)
        } catch AppleSignInPresenterError.cancelled {
            // The user dismissed the dialog -- not a real error.
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    func signOut() {
        state = .signedOut
        errorMessage = nil
        appleAuthorizationCodeForRevocation = nil
    }

    private static func message(for error: Error) -> String {
        if let authError = error as? SupabaseAuthError {
            switch authError {
            case .server(_, let message):
                return message ?? "Something went wrong. Please try again."
            case .badResponse, .invalidPayload:
                return "Something went wrong. Please try again."
            }
        }
        return "Couldn't connect. Check your internet connection and try again."
    }
}
