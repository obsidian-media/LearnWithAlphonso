import Foundation

/// Account-scoped cleanup for the sign-in layer. Registered once at launch, after AccountDataCleanup, so it
/// runs after the queue, caches, widget and RevenueCat steps.
///
/// - Push token: on sign-out, delete this device's device_tokens row using the ENDING session's access token
///   (Session captures it before clearing; GoTrue tokens stay valid until expiry and Session.signOut does not
///   call /logout). Otherwise the previous account's nudges keep reaching this phone. Not on deletion:
///   deleteMyAccount already deleted the row, and the FK cascades.
/// - Local notifications: streak, review, recap and weakness reminders belong to the previous account.
/// - Apple: the credential link and any saved given name.
///
/// Every handler catches its own failure (SessionLifecycle's contract), so one cannot stop the next.
public enum AuthAccountCleanup {
    public enum HandlerID {
        public static let pushToken = "push.token"
        public static let localNotifications = "notifications.local"
        public static let appleCredential = "apple.credential"
    }

    @MainActor
    public static func register(
        on lifecycle: SessionLifecycle,
        deviceToken: @escaping @MainActor () -> String?,
        retiringAccessToken: @escaping @MainActor () -> String?,
        unregisterDeviceToken: @escaping @MainActor (_ token: String, _ accessToken: String) async throws -> Void,
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
        lifecycle.register(HandlerID.localNotifications) { _ in
            await clearLocalNotifications()
        }
        lifecycle.register(HandlerID.appleCredential) { _ in
            appleCredentials.clear()
            appleGivenNames.clearAll()
        }
    }
}
