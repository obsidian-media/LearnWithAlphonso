import SwiftUI
import UIKit
import LearnWithAlphonsoKit

/// Follows the system light/dark setting live, including a change while the app stays in the
/// foreground (scheduled automatic appearance, a Focus or Shortcut automation).
///
/// It reads the SCREEN's traits, never a window's or a view's: RootView applies `.preferredColorScheme`,
/// which overrides the window's style, and reading that back is exactly the build-38 launch-hang loop.
/// `UIScreen` is not affected by the app's own override. Every reading goes through the Kit's
/// `AppearanceChangeGate`, which drops repeats and stops after 4 changes in 2 seconds.
@MainActor
final class SystemAppearanceObserver {
    private var gate = AppearanceChangeGate()
    private var registration: (any UITraitChangeRegistration)?

    /// Starts listening (once) and applies the current reading.
    func start() {
        if registration == nil {
            registration = UIScreen.main.registerForTraitChanges([UITraitUserInterfaceStyle.self]) { [weak self] (_: UIScreen, _: UITraitCollection) in
                MainActor.assumeIsolated { self?.applyCurrent() }
            }
        }
        applyCurrent()
    }

    /// Applies the screen's current appearance if it changed. `rearm` (on returning to the foreground)
    /// clears a tripped gate, so a single bad burst cannot freeze the theme for the rest of the session.
    func applyCurrent(rearm: Bool = false) {
        if rearm { gate.rearm() }
        let reading: AppearanceChangeGate.Appearance = UIScreen.main.traitCollection.userInterfaceStyle == .dark ? .dark : .light
        guard gate.offer(reading, at: Date()) else { return }
        AlphonsoThemeManager.shared.updateSystemColorScheme(reading == .dark ? .dark : .light)
    }
}
