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
        // AfterFirstUnlock, so a background refresh or a fast cold launch before the user unlocks can still read
        // it; ThisDeviceOnly, so it never moves to another device in a backup or a device-to-device transfer.
        // Never synced to iCloud Keychain (kSecAttrSynchronizable is not set). save() always deletes and re-adds,
        // so an item stored under the older attribute is rewritten with this one on the next save.
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
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

    /// Clears a session left behind by an earlier install of the app. Call once at launch, before load().
    ///
    /// The first launch after an app UPDATE also has no install marker (builds before the marker never wrote it), so
    /// the marker alone cannot tell an update from a reinstall. A session saved by those builds still carries the older
    /// accessibility attribute (anything but this-device-only): that one is kept and rewritten as this-device-only, so updating the app does not sign
    /// every learner out. A this-device-only session with no marker can only be a previous install's, and is cleared.
    static func clearIfFreshInstall(defaults: UserDefaults = .standard) {
        guard FreshInstallGuard.isFirstLaunchOfThisInstall(defaults: defaults) else { return }
        if let stored = storedAccessibility(),
           stored != (kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String),
           let session = load() {
            save(session)
            return
        }
        clear()
    }

    /// The kSecAttrAccessible value of the stored session item, or nil when there is none.
    private static func storedAccessibility() -> String? {
        var query = baseQuery
        query[kSecReturnAttributes as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let attributes = result as? [String: Any] else { return nil }
        return attributes[kSecAttrAccessible as String] as? String
    }

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
