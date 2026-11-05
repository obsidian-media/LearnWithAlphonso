import Foundation

/// The Keychain outlives an uninstall; UserDefaults does not. So the first launch of an install, seen as a missing
/// marker in UserDefaults, is when a session left in the Keychain by an earlier install (or an earlier owner of the
/// device) must be cleared instead of resumed.
public enum FreshInstallGuard {
    static let markerKey = "install.keychainSessionChecked"

    /// True exactly once per install, then false on every later launch.
    public static func isFirstLaunchOfThisInstall(defaults: UserDefaults = .standard) -> Bool {
        if defaults.bool(forKey: markerKey) { return false }
        defaults.set(true, forKey: markerKey)
        return true
    }
}
