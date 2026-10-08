import AuthenticationServices
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
    /// Fires shortly before the current access token expires -- see
    /// `scheduleProactiveRefresh`.
    private var proactiveRefreshTask: Task<Void, Never>?
    private let googleSignInPresenter = GoogleSignInPresenter()
    private let appleSignIn = AppleSignInCoordinator()
    private let appleCredentials = AppleCredentialStore()
    private let appleGivenNames = AppleGivenNameStore()
    @ObservationIgnored private var appleRevocationObserver: NSObjectProtocol?

    /// The email sign-in steps (Kit EmailCodeFlow). AuthView binds the address field to `emailFlow.email`.
    var emailFlow = EmailCodeFlow()
    /// A non-error message for the sign-in screen, e.g. why the learner was signed out.
    private(set) var notice: String?
    /// The access token of the session that is ending, readable only while SessionLifecycle handlers run, so
    /// the push-token handler can delete the old account's device row (AuthAccountCleanup).
    @ObservationIgnored private(set) var retiringAccessToken: String?
    private let lifecycle: SessionLifecycle
    /// The cleanup started by the last sign-out or deletion. Every path that can establish a
    /// new session awaits it first, so a quick re-sign-in never interleaves with the previous
    /// account's cleanup.
    private var lifecycleTask: Task<Void, Never>?
    /// Survives a process kill between a sign-out and its cleanup finishing; the next launch
    /// finishes it (restoreSession).
    private let pendingCleanup = PendingCleanupStore()
    private var cleanupSequence = 0

    init(
        authClient: SupabaseAuthClient = SupabaseAuthClient(
            supabaseURL: AppConfig.supabaseURL,
            publishableKey: AppConfig.supabasePublishableKey
        ),
        lifecycle: SessionLifecycle
    ) {
        self.authClient = authClient
        self.lifecycle = lifecycle
        // Apple posts this when the learner stops using Apple ID with this app (Settings > Apple ID > Sign in
        // with Apple). Re-check the state rather than trusting the post alone.
        appleRevocationObserver = NotificationCenter.default.addObserver(
            forName: ASAuthorizationAppleIDProvider.credentialRevokedNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in await self?.checkAppleCredential() }
        }
    }

    var accessToken: String? {
        if case .signedIn(let session) = state { return session.accessToken }
        return nil
    }

    /// Returns a token that's valid *right now* -- refreshing first if the
    /// current one is expired or within 60 seconds of it (same buffer
    /// `restoreSession()` already uses), or unconditionally when
    /// `forceRefresh` is true. Nil means "no signed-in session" or "the
    /// refresh itself failed". Only a refresh token the server rejects
    /// signs out -- a session backed by one is worse than being asked to
    /// sign in again -- while a network failure leaves the session alone.
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
            // Only a refresh token the server actually rejects ends the
            // session. Being offline or rate-limited used to sign the
            // learner out too (2026-09-29 audit); now the caller just gets
            // nil and shows its own error.
            if Self.isRejectedRefreshToken(error) { signOut() }
            return nil
        }
    }

    /// 400/401/403 from GoTrue's token endpoint mean the refresh token is
    /// invalid, revoked or already used. Anything else -- 429, 5xx, no
    /// network -- is transient and must not end the session.
    private static func isRejectedRefreshToken(_ error: Error) -> Bool {
        guard case SupabaseAuthError.server(let status, _) = error else { return false }
        return [400, 401, 403].contains(status)
    }

    /// The signed-in user's own id -- for anything that needs to reference
    /// "me" client-side (building an invite link, comparing a leaderboard
    /// row to "is this me"). See SupabaseSession.userID's doc comment.
    var userID: String? {
        if case .signedIn(let session) = state { return session.userID }
        return nil
    }

    func requestCode() async {
        errorMessage = nil
        notice = nil
        guard emailFlow.canSendCode else {
            emailFlow.markInvalidEmail()
            return
        }
        isBusy = true
        defer { isBusy = false }
        let email = emailFlow.trimmedEmail
        do {
            try await authClient.requestEmailOTP(email: email)
            emailFlow.codeSent(at: Date())
            state = .awaitingCode(email: email)
        } catch {
            emailFlow.sendFailed(error, now: Date())
        }
    }

    /// "Resend code": allowed 60 s after the last send (EmailCodeFlow), longer if the server asks.
    func resendCode() async {
        guard case .awaitingCode(let email) = state, emailFlow.canResend(now: Date()), !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            try await authClient.requestEmailOTP(email: email)
            emailFlow.codeResent(at: Date())
        } catch {
            emailFlow.sendFailed(error, now: Date())
        }
    }

    /// "Use a different email": back to the email step with the address kept.
    func useDifferentEmail() {
        emailFlow.useDifferentEmail()
        errorMessage = nil
        state = .signedOut
    }

    /// The code field's setter. The sixth digit submits without a tap.
    func enterCode(_ text: String) {
        if emailFlow.enterCode(text), !isBusy {
            Task { await verifyCode() }
        }
    }

    func verifyCode() async {
        // Busy first, so a double tap during the pending cleanup cannot start a second verify.
        guard !isBusy, emailFlow.isCodeComplete else { return }
        errorMessage = nil
        isBusy = true
        defer { isBusy = false }
        await finishPendingCleanup()
        guard case .awaitingCode(let email) = state else { return }
        do {
            let session = try await authClient.verifyEmailOTP(email: email, code: emailFlow.code)
            establishSession(session)
        } catch {
            emailFlow.verificationFailed(error, now: Date())
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
        await finishPendingCleanup()
        defer { isRestoring = false }
        // A previous run was killed between a sign-out and its cleanup finishing.
        await lifecycle.resumePending(pendingCleanup)
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
        } catch where Self.isRejectedRefreshToken(error) {
            KeychainSessionStore.clear()
        } catch {
            // Offline or a server hiccup at launch: stay signed in on the
            // stored session. establishSession schedules a refresh a few
            // seconds out, and refreshIfNeeded keeps retrying every 30s
            // until the network is back. Clearing here used to sign a
            // learner out just for opening the app in airplane mode.
            establishSession(stored)
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
        notice = nil
        emailFlow.clearFailure()
        isBusy = true
        defer { isBusy = false }
        await finishPendingCleanup()
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

    /// SignInWithAppleButton's onRequest.
    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        errorMessage = nil
        notice = nil
        emailFlow.clearFailure()
        appleSignIn.prepare(request)
    }

    /// SignInWithAppleButton's onCompletion. Required alongside Google by App Store Guideline 4.8.
    func completeAppleSignIn(_ result: Result<ASAuthorization, Error>) async {
        let authorization: ASAuthorization
        switch result {
        case .success(let value):
            authorization = value
        case .failure(let error):
            if AppleSignInCoordinator.isCancellation(error) { return }
            errorMessage = Self.message(for: error)
            return
        }
        errorMessage = nil
        isBusy = true
        defer { isBusy = false }
        await finishPendingCleanup()
        do {
            let apple = try appleSignIn.result(from: authorization)
            let session = try await authClient.signInWithIDToken(provider: "apple", idToken: apple.identityToken, nonce: apple.rawNonce)
            establishSession(session)
            // Remember which Apple ID signed in on this device, for which account.
            appleCredentials.save(AppleCredentialLink(appleUserID: apple.appleUserID, supabaseUserID: session.userID))
            // Apple sends the name only on the first authorization: keep it for the name prompt's prefill,
            // locally and in the account's metadata (so a reinstall before the prompt still has it).
            if let givenName = apple.givenName {
                appleGivenNames.save(givenName, userID: session.userID)
                saveAppleGivenName(givenName, accessToken: session.accessToken)
            }
            // Apple does not always return an authorization code. Nil means there is nothing to link or revoke
            // later; deletion already treats a missing token as "could not revoke" and proceeds.
            if let code = apple.authorizationCode {
                linkAppleAuthorization(code: code)
            }
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    var appleGivenNameForCurrentUser: String? {
        userID.flatMap { appleGivenNames.load(userID: $0) }
    }

    /// Fire-and-forget, same posture as linkAppleAuthorization: the local copy already serves the prompt.
    private func saveAppleGivenName(_ givenName: String, accessToken: String) {
        let client = authClient
        Task {
            do {
                try await client.updateUserMetadata(accessToken: accessToken, ["given_name": givenName])
            } catch {
                print("[Session] Could not save the Apple given name to the account: \(error)")
            }
        }
    }

    /// At launch, on every return to the foreground (RootView), and on Apple's revocation notification. Only the
    /// account that signed in with Apple on this device is checked (AppleCredentialPolicy).
    func checkAppleCredential() async {
        guard let checkedUser = userID,
              let appleUserID = AppleCredentialPolicy.appleUserToCheck(link: appleCredentials.load(), signedInUserID: checkedUser)
        else { return }
        let status = await AppleCredentialStateReader.status(forAppleUserID: appleUserID)
        // A sign-out or a different sign-in while the system answered wins.
        guard userID == checkedUser else { return }
        if case .signOut(let message) = AppleCredentialPolicy.decision(for: status) {
            endSession(.signedOut, notice: message)
        }
    }

    /// Prefill source for the name prompt (Google full_name/name/given_name, or Apple's saved given_name).
    func fetchUserNames() async -> AuthUserNames? {
        guard let token = await freshAccessToken() else { return nil }
        return try? await authClient.fetchUserNames(accessToken: token)
    }

    func dismissNotice() {
        notice = nil
    }

    /// Ends the session locally and runs every SessionLifecycle handler for `.signedOut`
    /// (entitlements, the offline queue, caches, the widget, and whatever other features
    /// registered).
    func signOut() {
        endSession(.signedOut)
    }

    /// Called only after the server has deleted the account (SettingsView.deleteAccount).
    /// Same local teardown as sign-out, but handlers see `.accountDeleted`, so they can also
    /// remove what only deletion should.
    func accountDeleted() {
        endSession(.accountDeleted)
    }

    /// Awaited by every sign-in path before it establishes a session.
    func finishPendingCleanup() async {
        await lifecycleTask?.value
    }

    private func endSession(_ event: SessionLifecycle.Event, notice: String? = nil) {
        // Captured BEFORE the state is cleared: the push-token handler deletes the old account's device row with
        // it (GoTrue access tokens stay valid until expiry; signOut does not call /logout).
        let endingAccessToken = accessToken
        proactiveRefreshTask?.cancel()
        proactiveRefreshTask = nil
        state = .signedOut
        errorMessage = nil
        self.notice = notice
        emailFlow = EmailCodeFlow()
        KeychainSessionStore.clear()
        // Durable before anything can suspend: if the process dies now, the next launch
        // runs the cleanup (restoreSession).
        pendingCleanup.mark(event)
        cleanupSequence += 1
        let sequence = cleanupSequence
        // Chained, never concurrent: a second sign-out waits for the first one's cleanup, and each run sees
        // its own ending token.
        let previous = lifecycleTask
        let lifecycle = self.lifecycle
        lifecycleTask = Task { @MainActor [weak self] in
            await previous?.value
            self?.retiringAccessToken = endingAccessToken
            await lifecycle.run(event)
            self?.retiringAccessToken = nil
            // Only the newest sign-out clears the marker; an older one finishing must not
            // hide a newer cleanup that is still owed.
            if let self, self.cleanupSequence == sequence {
                self.pendingCleanup.clear()
            }
        }
    }

    /// Refreshes the session when its access token is expired or within
    /// `leeway` of expiring; otherwise does nothing. Best-effort, unlike
    /// `freshAccessToken`: a network failure (offline, timeout) keeps the
    /// current session and retries shortly, and only an auth server that
    /// actually rejects the refresh token signs out.
    ///
    /// **Why this exists (2026-09-29 pre-submission audit).** About 47
    /// call sites build their API client from the plain `accessToken`
    /// property, which was only ever refreshed at cold launch and by the
    /// four voice screens. After ~1 hour in the foreground, every one of
    /// them -- account deletion and export, reporting a user, sync --
    /// failed until relaunch. Keeping the stored token fresh here fixes
    /// all of them at once instead of converting each call site.
    func refreshIfNeeded(leeway: TimeInterval = 300) async {
        guard case .signedIn(let current) = state,
              current.expiresAt <= Date().addingTimeInterval(leeway) else { return }
        do {
            let refreshed = try await authClient.refresh(current)
            // A sign-out (or a different sign-in) while the request was in
            // flight wins over this now-stale refresh.
            guard case .signedIn(let stillCurrent) = state, stillCurrent == current else { return }
            establishSession(refreshed)
        } catch {
            // Same rule as the success path: a failure that belongs to a
            // session that has since been replaced must not touch the new one.
            guard case .signedIn(let stillCurrent) = state, stillCurrent == current else { return }
            if Self.isRejectedRefreshToken(error) {
                signOut()
            } else {
                scheduleProactiveRefresh(after: 30)
            }
        }
    }

    /// The one place `state` transitions to `.signedIn` -- every path
    /// (email OTP, Google, Apple, and a cold-launch restore) routes
    /// through here so Keychain persistence is never something a future
    /// sign-in method could forget to wire up.
    private func establishSession(_ session: SupabaseSession) {
        state = .signedIn(session)
        KeychainSessionStore.save(session)
        // Five minutes before expiry. Task.sleep does not advance while
        // the app is suspended, so RootView also calls refreshIfNeeded()
        // on every return to the foreground.
        scheduleProactiveRefresh(after: session.expiresAt.timeIntervalSinceNow - 300)
    }

    private func scheduleProactiveRefresh(after delay: TimeInterval) {
        proactiveRefreshTask?.cancel()
        let seconds = max(delay, 5)
        proactiveRefreshTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            // Wider than the 300s the timer was scheduled for, so a wake-up
            // a moment early still counts as due.
            await self?.refreshIfNeeded(leeway: 360)
        }
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
            // Second-opinion audit (2026-09-28): this used to swallow a
            // thrown error with zero trace anywhere -- silent even by
            // this file's own "fail soft" standard, since /api/apple-link
            // itself now logs server-side on every one of its own failure
            // branches (found in the same audit), but a request that
            // never REACHES the server (offline, DNS, timeout) leaves no
            // server-side trace to find. Matches AccountClient's own
            // print on a failed *revocation* at deletion time -- same
            // "still don't block anything, but stop being invisible"
            // posture, not a behavior change.
            do {
                try await client.linkAppleAuthorization(code: code)
            } catch {
                print("[Session] Failed to link this sign-in's Apple authorization code for later revocation: \(error)")
            }
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
        if error is URLError { return Copy.connectionFailure }
        if case SupabaseAuthError.server(let status, let message) = error {
            if status == 429 { return AuthCopy.tooManyRequests }
            return message ?? AuthCopy.generic
        }
        return AuthCopy.generic
    }
}
