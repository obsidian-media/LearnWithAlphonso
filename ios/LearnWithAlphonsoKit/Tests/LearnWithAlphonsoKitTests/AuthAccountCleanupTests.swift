import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

@MainActor
final class AuthAccountCleanupTests: XCTestCase {
    private struct Boom: Error {}

    private final class Log {
        var unregistered: [(token: String, accessToken: String)] = []
        var notificationClears = 0
    }

    private func makeDefaults() -> UserDefaults {
        UserDefaults(suiteName: "AuthAccountCleanupTests.\(UUID().uuidString)")!
    }

    private func register(
        _ lifecycle: SessionLifecycle,
        log: Log,
        deviceToken: String? = "apns-hex",
        accessToken: String? = "ending-access-token",
        unregisterThrows: Bool = false,
        defaults: UserDefaults
    ) -> (AppleCredentialStore, AppleGivenNameStore) {
        let credentials = AppleCredentialStore(defaults: defaults)
        let givenNames = AppleGivenNameStore(defaults: defaults)
        AuthAccountCleanup.register(
            on: lifecycle,
            deviceToken: { deviceToken },
            retiringAccessToken: { accessToken },
            unregisterDeviceToken: { token, access in
                if unregisterThrows { throw Boom() }
                log.unregistered.append((token, access))
            },
            clearLocalNotifications: { log.notificationClears += 1 },
            appleCredentials: credentials,
            appleGivenNames: givenNames
        )
        return (credentials, givenNames)
    }

    func testSignOutRemovesThisDevicesTokenWithTheEndingAccountsToken() async {
        let lifecycle = SessionLifecycle()
        let log = Log()
        _ = register(lifecycle, log: log, defaults: makeDefaults())
        await lifecycle.run(.signedOut)
        XCTAssertEqual(log.unregistered.count, 1)
        XCTAssertEqual(log.unregistered.first?.token, "apns-hex")
        XCTAssertEqual(log.unregistered.first?.accessToken, "ending-access-token")
        XCTAssertEqual(log.notificationClears, 1)
    }

    func testDeletionDoesNotCallTheServerButStillClearsTheDevice() async {
        let lifecycle = SessionLifecycle()
        let log = Log()
        let defaults = makeDefaults()
        let (credentials, givenNames) = register(lifecycle, log: log, defaults: defaults)
        credentials.save(AppleCredentialLink(appleUserID: "a", supabaseUserID: "u1"))
        givenNames.save("Zoë", userID: "u1")
        await lifecycle.run(.accountDeleted)
        XCTAssertTrue(log.unregistered.isEmpty, "deleteMyAccount already removed device_tokens; the user no longer exists")
        XCTAssertEqual(log.notificationClears, 1)
        XCTAssertNil(credentials.load())
        XCTAssertNil(givenNames.load(userID: "u1"))
    }

    func testAFailedUnregisterDoesNotStopTheOtherCleanup() async {
        let lifecycle = SessionLifecycle()
        let log = Log()
        let defaults = makeDefaults()
        let (credentials, _) = register(lifecycle, log: log, unregisterThrows: true, defaults: defaults)
        credentials.save(AppleCredentialLink(appleUserID: "a", supabaseUserID: "u1"))
        await lifecycle.run(.signedOut)
        XCTAssertEqual(log.notificationClears, 1)
        XCTAssertNil(credentials.load())
    }

    func testNothingToUnregisterWithoutATokenOrASession() async {
        for (device, access) in [(nil, "t"), ("hex", nil)] as [(String?, String?)] {
            let lifecycle = SessionLifecycle()
            let log = Log()
            _ = register(lifecycle, log: log, deviceToken: device, accessToken: access, defaults: makeDefaults())
            await lifecycle.run(.signedOut)
            XCTAssertTrue(log.unregistered.isEmpty)
            XCTAssertEqual(log.notificationClears, 1)
        }
    }

    func testHandlerIDsAreStableAndOrdered() {
        let lifecycle = SessionLifecycle()
        _ = register(lifecycle, log: Log(), defaults: makeDefaults())
        XCTAssertEqual(lifecycle.registeredIDs, ["push.token", "notifications.local", "apple.credential"])
    }
}
