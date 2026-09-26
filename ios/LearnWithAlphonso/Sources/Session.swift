import Foundation
import Observation
import LearnWithAlphonsoKit

/// App-wide auth state, driving which root view (AuthView vs. the signed-in
/// app) is shown. The session (including its refresh token) is persisted
/// to the Keychain -- not UserDefaults, see KeychainSessionStore's own
/// doc comment -- so the app restores a prior sign-in on cold launch
/// instead of re-prompting every time. `restoreSession()` must be called
/// once at launch (RootView does this) before `state`/`isRestoring` mean
/// anything; until then this reads as freshly signed out.
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
    /// True until `restoreSession()` has resolved (found nothing, restored
    /// a still-valid session, or refreshed an expired one) -- RootView
    /// shows a blank/loading screen while this is true rather than
    /// flashing AuthView and then flipping to the signed-in app a moment
    /// later.
    private(set) var isRestoring = true

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

    /// Returns a token that's valid *right now* -- refreshing first if the
    /// current one is expired or within 60 seconds of it (same buffer
    /// `restoreSession()` already uses), or unconditionally when
    /// `forceRefresh` is true. Nil means "no signed-in session" or "the
    /// refresh itself failed" -- the latter signs out, same posture as
    /// `restoreSession()`'s own failure path: a session backed by a
    /// refresh token nothing will accept is worse than being asked to
    /// sign in again.
    ///
    /// **Why this exists.** Before this, a token was refreshed exactly
    /// once, at cold launch, and never again for the rest of a live
    /// session. Any authenticated call made more than ~an hour into a
    /// session (Supabase's default access-token lifetime, confirmed:
    /// no `jwt_expiry` override in `supabase/config.toml`) 401'd with no
    /// way for the learner to understand why -- confirmed against real
    /// production logs (`/api/stt` 401s from an actual device test), not
    /// assumed from reading the code. Callers pass this as both the
    /// initial token AND the `refreshAccessToken` closure on
    /// `AccountClient`/`AIConversationClient` (`forceRefresh: true` in
    /// that closure -- a 401 already means the proactive check above
    /// wasn't enough, so there's no reason to re-check expiry before
    /// trying again), so proactive refresh and the one-retry-on-401
    /// backstop share this exact same logic rather than two copies of it.
    func freshAccessToken(forceRefresh: Bool = false) async -> String? {
        guard case .signedIn(let current) = state else { return nil }
        if !forceRefresh && current.expiresAt > Date().addingTimeInterval(60) {
            return current.accessToken
        }
        do {
            let refreshed = try await authClient.refresh(current)
            establishSession(refreshed)
            return refreshed.accessToken
        } catch {
            signOut()
            return nil
        }
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
            establishSession(session)
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    /// Restores a Keychain-persisted session on cold launch. A session
    /// that's still valid (with a small buffer so it can't expire mid-
    /// restore) is used as-is; an expired one is refreshed first. A
    /// refresh failure means the stored session is unusable -- clearing
    /// it and staying signed out is the right outcome here, not a
    /// signed-in shell backed by a refresh token nothing will accept
    /// (every subsequent API call would 401, with no obvious reason why
    /// to a user who's staring at what looks like a normal signed-in app).
    func restoreSession() async {
        defer { isRestoring = false }
        if let bootstrapped = Self.uiTestBootstrapSession() {
            establishSession(bootstrapped)
            return
        }
        guard let stored = KeychainSessionStore.load() else { return }
        if stored.expiresAt > Date().addingTimeInterval(60) {
            establishSession(stored)
            return
        }
        do {
            let refreshed = try await authClient.refresh(stored)
            establishSession(refreshed)
        } catch {
            KeychainSessionStore.clear()
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
            establishSession(session)
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
            establishSession(session)
            // Apple does not always return an authorization code. Nil means
            // there is simply nothing to link -- and nothing to revoke later
            // either -- so skip rather than force-unwrap. Deletion already
            // treats a missing token as "could not revoke" and proceeds.
            if let code = result.authorizationCode {
                linkAppleAuthorization(code: code)
            }
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
        KeychainSessionStore.clear()
    }

    /// The one place `state` transitions to `.signedIn` -- every path
    /// (email OTP, Google, Apple, and a cold-launch restore) routes
    /// through here so Keychain persistence is never something a future
    /// sign-in method could forget to wire up.
    private func establishSession(_ session: SupabaseSession) {
        state = .signedIn(session)
        KeychainSessionStore.save(session)
    }

    /// Fire-and-forget: posts the one-time Apple authorization code to
    /// /api/apple-link so a later account deletion can revoke that grant
    /// (see AccountClient.linkAppleAuthorization's own doc comment for
    /// the full trust-boundary reasoning). Detached from signInWithApple's
    /// own async flow -- not awaited -- so a slow or failing network call
    /// here can never delay or block a sign-in the identity token already
    /// completed; `try?` swallows the result entirely, on purpose.
    ///
    /// Reads its own access token via `freshAccessToken()` rather than
    /// taking one as a parameter, and wires the same method as the 401
    /// retry -- even though this fires with a token minted moments
    /// earlier by the sign-in that just succeeded, so proactive refresh
    /// isn't expected to ever trigger here. If this call still 401s after
    /// that retry, staleness is not the explanation -- see this fix's PR
    /// description for that open question.
    private func linkAppleAuthorization(code: String) {
        Task {
            guard let accessToken = await freshAccessToken() else { return }
            let client = AccountClient(
                baseURL: AppConfig.apiBaseURL,
                accessToken: { accessToken },
                refreshAccessToken: { await self.freshAccessToken(forceRefresh: true) }
            )
            try? await client.linkAppleAuthorization(code: code)
        }
    }

    /// UI-testing only: lets the App Store screenshot pipeline (see
    /// .github/workflows/capture-app-store-screenshots.yml) sign in as the
    /// seeded demo account non-interactively. This is a REAL session for a
    /// REAL account that already has real seeded progress
    /// (scripts/seed-demo-account.ts) and real Pro entitlement, granted by
    /// hand in the RevenueCat dashboard -- it bypasses the interactive
    /// login UI only, never any entitlement or authorization check itself.
    /// Inert without every one of these environment variables set, which a
    /// real device or App Store build never has, and compiles to a plain
    /// `return nil` outside DEBUG so it cannot ship in Release regardless.
    private static func uiTestBootstrapSession() -> SupabaseSession? {
        #if DEBUG
        let env = ProcessInfo.processInfo.environment
        guard let accessToken = env["UI_TEST_ACCESS_TOKEN"],
              let refreshToken = env["UI_TEST_REFRESH_TOKEN"],
              let userID = env["UI_TEST_USER_ID"] else {
            return nil
        }
        let expiresAt = env["UI_TEST_EXPIRES_AT"]
            .flatMap { TimeInterval($0) }
            .map { Date(timeIntervalSince1970: $0) }
            ?? Date().addingTimeInterval(3600)
        return SupabaseSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt,
            userID: userID
        )
        #else
        return nil
        #endif
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
