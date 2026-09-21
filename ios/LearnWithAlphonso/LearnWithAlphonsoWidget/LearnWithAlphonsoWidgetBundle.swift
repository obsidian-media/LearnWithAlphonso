import WidgetKit
import SwiftUI

/// V4 candidate #6 -- home-screen streak widget. A WidgetBundle is
/// required as the extension's entry point even with a single widget
/// (Apple's own template shape), so future widgets (e.g. a daily-goal
/// widget) can be added here without a second extension target.
@main
struct LearnWithAlphonsoWidgetBundle: WidgetBundle {
    var body: some Widget {
        StreakWidget()
    }
}
