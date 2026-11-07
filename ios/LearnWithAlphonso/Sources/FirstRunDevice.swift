import AVFoundation
import Foundation
import Security
import UIKit
import LearnWithAlphonsoKit

/// The first run's storage on this device (Kit FirstRunStore): the answers in UserDefaults until sign-in, the under-13
/// block in the Keychain AND UserDefaults. The Keychain item is this-device-only and outlives a reinstall; the
/// UserDefaults copy keeps the block across a relaunch even where the Keychain write fails (an unsigned simulator
/// build has no Keychain entitlement: the relaunch UI test caught exactly that). Either copy blocks.
enum FirstRunDevice {
    static let store = FirstRunStore(
        draftStorage: DefaultsKeyValue(),
        blockStorage: EitherKeyValue(first: KeychainFlagKeyValue(), second: DefaultsKeyValue()))

    /// True once this device answered Under 13. Read by everything that would send: crash reporting, RevenueCat,
    /// the update check, the session restore, sign-out's server calls and speech.
    static var isBlocked: Bool { store.isBlocked() }
}

private final class DefaultsKeyValue: FirstRunKeyValue {
    func string(forKey key: String) -> String? { UserDefaults.standard.string(forKey: key) }
    func set(_ value: String?, forKey key: String) {
        if let value { UserDefaults.standard.set(value, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
        UserDefaults.standard.synchronize()
    }
}

/// Writes both stores; a value in either one counts.
private final class EitherKeyValue: FirstRunKeyValue {
    private let first: FirstRunKeyValue
    private let second: FirstRunKeyValue
    init(first: FirstRunKeyValue, second: FirstRunKeyValue) { self.first = first; self.second = second }
    func string(forKey key: String) -> String? { first.string(forKey: key) ?? second.string(forKey: key) }
    func set(_ value: String?, forKey key: String) {
        first.set(value, forKey: key)
        second.set(value, forKey: key)
    }
}

/// A generic-password item per key, never synced to iCloud Keychain.
private final class KeychainFlagKeyValue: FirstRunKeyValue {
    private let service = "com.obsidianmedia.learnwithalphonso.firstrun"

    private func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
    }

    func string(forKey key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func set(_ value: String?, forKey key: String) {
        SecItemDelete(query(key) as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var q = query(key)
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }
}

/// Alphonso reads each step's line on tap: on-device speech (no network, no account), like the lesson's play button.
/// A blocked device never speaks again.
@MainActor
enum FirstRunVoice {
    private static let synthesizer = AVSpeechSynthesizer()

    static func speak(_ text: String, course: Course = .english) {
        guard !FirstRunDevice.isBlocked else { return }
        synthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: FirstRun.spoken(text))
        utterance.voice = SpeechVoice.voice(for: course)
        synthesizer.speak(utterance)
    }

    static func stop() { synthesizer.stopSpeaking(at: .immediate) }
}

/// The first run's pictures that are not in LessonArt: Hector's two cut-outs and the 16 animal profile pictures.
@MainActor
enum FirstRunArt {
    private static var cache: [String: UIImage] = [:]

    private static func image(_ folder: String, _ name: String) -> UIImage? {
        let key = folder + "/" + name
        if let hit = cache[key] { return hit }
        guard let loaded = UIImage(contentsOfFile: Bundle.main.bundlePath + "/" + key + ".webp") else { return nil }
        let image = loaded.preparingForDisplay() ?? loaded
        cache[key] = image
        return image
    }

    static func hector(_ name: String) -> UIImage? { image("FirstRunArt", name) }
    static func avatar(_ id: String) -> UIImage? { image("ProfileAvatars", id) }
}
