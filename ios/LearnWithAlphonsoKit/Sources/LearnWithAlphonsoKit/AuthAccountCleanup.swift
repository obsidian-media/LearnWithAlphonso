import Foundation

/// Account-scoped cleanup for the sign-in layer. Registered once at launch, after AccountDataCleanup, so it
/// runs after the queue, caches, widget and RevenueCat steps.
///
/// - Push token: on sign-out, delete this device's device_tokens row using the ENDING session's access token
///   (Session captures it before clearing). Otherwise the previous account's nudges keep reaching this phone. Not
///   on deletion: deleteMyAccount already deleted the row, and the FK cascades.
/// - Server session: on sign-out, end this device's session on the auth server with the same ending token, so a
///   copied refresh token stops working. After the push-token step, which still needs the token. Not on deletion:
///   the account and its sessions are already gone.
/// - Local notifications: streak, review, recap and weakness reminders belong to the previous account.
/// - Apple: the credential link and any saved given name.
///
/// Every handler catches its own failure (SessionLifecycle's contract), so one cannot stop the next.
public enum AuthAccountCleanup {
    public enum HandlerID {
        public static let pushToken = "push.token"
        public static let serverSession = "auth.serverSession"
        public static let localNotifications = "notifications.local"
        public static let appleCredential = "apple.credential"
    }

    @MainActor
    public static func register(
        on lifecycle: SessionLifecycle,
        deviceToken: @escaping @MainActor () -> String?,
        retiringAccessToken: @escaping @MainActor () -> String?,
        unregisterDeviceToken: @escaping @MainActor (_ token: String, _ accessToken: String) async throws -> Void,
        endServerSession: @escaping @MainActor (_ accessToken: String) async throws -> Void,
        clearLocalNotifications: @escaping @MainActor () async -> Void,
        appleCredentials: AppleCredentialStore,
        appleGivenNames: AppleGivenNameStore
    ) {
        lifecycle.register(HandlerID.pushToken) { event in
            guard event == .signedOut, let token = deviceToken(), let accessToken = retiringAccessToken() else { return }
            do {
                try await unregisterDeviceToken(token, accessToken)
            } catch {
                print("[AuthAccountCleanup] Could not remove this device's push token for the signed-out account: \(error)")
            }
        }
        lifecycle.register(HandlerID.serverSession) { event in
            guard event == .signedOut, let accessToken = retiringAccessToken() else { return }
            do {
                try await endServerSession(accessToken)
            } catch {
                // Best effort: offline or an already-expired token. The refresh token then expires on its own.
                print("[AuthAccountCleanup] Could not end the server session for the signed-out account: \(error)")
            }
        }
        lifecycle.register(HandlerID.localNotifications) { _ in
            await clearLocalNotifications()
        }
        lifecycle.register(HandlerID.appleCredential) { _ in
            appleCredentials.clear()
            appleGivenNames.clearAll()
        }
    }
}
