import Foundation
import Security
import LearnWithAlphonsoKit

/// Persists the signed-in `SupabaseSession` -- including its refresh
/// token -- in the Keychain, not UserDefaults. UserDefaults' backing
/// plist sits in the app container as plaintext (readable by anything
/// with filesystem access to a jailbroken/debug device, and included
/// unencrypted in a plain file-system backup); a leaked refresh token is
/// a standing account takeover, not just a leaked preference. Lives in
/// the app target, not LearnWithAlphonsoKit -- the `Security` framework
/// this needs is Darwin-only, and the Kit package builds and runs its
/// tests on Windows (see swift-test.ps1), so any `import Security` here
/// would break that, not just go untested by it.
///
/// One fixed account name: this app only ever has one signed-in user at
/// a time, so there is nothing a second Keychain item would buy.
enum KeychainSessionStore {
    private static let service = "com.obsidianmedia.learnwithalphonso.session"
    private static let account = "supabase-session"

    /// Delete-then-add rather than SecItemUpdate: only one session is
    /// ever stored, so there is no update-semantics benefit, and it
    /// sidesteps a second set of OSStatus cases (item-not-found on
    /// update vs. duplicate-item on add) for what should just be "make
    /// the Keychain match this value."
    static func save(_ session: SupabaseSession) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        SecItemDelete(baseQuery as CFDictionary)
        var query = baseQuery
        query[kSecValueData as String] = data
        // AfterFirstUnlock (not WhenUnlockedThisDeviceOnly): a background
        // refresh -- or this app's own restoreSession() racing a very
        // fast cold launch before the user has unlocked -- must still be
        // able to read this. Never synced to iCloud Keychain (that
        // requires kSecAttrSynchronizable, not set here), so this never
        // leaves the device.
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load() -> SupabaseSession? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(SupabaseSession.self, from: data)
    }

    static func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
