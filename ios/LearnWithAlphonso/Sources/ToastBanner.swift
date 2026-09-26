import SwiftUI

/// A lightweight, self-dismissing in-app banner -- shared by
/// LeaderboardView's overtake toast and FriendsView's nudge banner, both
/// of which chose an in-app banner over a system notification for the
/// same underlying reason: the moment is only ever detected while the app
/// is already foregrounded (a foreground leaderboard re-fetch, a
/// foreground unread-nudges poll), so a UNUserNotificationCenter round
/// trip adds nothing a plain in-app banner doesn't already do.
struct ToastBanner: View {
    let message: String
    var iconName = "bell.fill"
    var iconColor = AlphonsoColor.ember

    var body: some View {
        HStack(spacing: AlphonsoSpacing.xs + 2) {
            Image(systemName: iconName)
                .foregroundStyle(iconColor)
            Text(message)
                .font(AlphonsoFont.sans(14, weight: .medium))
                .foregroundStyle(AlphonsoColor.ink)
        }
        .padding(.horizontal, AlphonsoSpacing.md - 2)
        .padding(.vertical, AlphonsoSpacing.sm + 2)
        .background(AlphonsoColor.parchment, in: Capsule())
        .overlay(Capsule().strokeBorder(AlphonsoColor.hairline, lineWidth: 1))
        .shadow(color: AlphonsoColor.ink.opacity(0.12), radius: 6, y: 2)
    }

    /// The `.transition(...)` each call site applies to a conditionally-
    /// rendered `ToastBanner` -- centralized here (both current call sites
    /// use it verbatim) rather than each one separately deciding whether to
    /// honor Reduced Motion. Still needs to be read from the call site's
    /// own `@Environment(\.accessibilityReduceMotion)` and passed in: an
    /// `AnyTransition` value has no environment access of its own.
    static func transition(reduceMotion: Bool) -> AnyTransition {
        reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity)
    }
}

/// Shows `message` via `binding` for a few seconds, then clears it --
/// factors out the identical show/auto-dismiss dance every toast call
/// site needs.
@MainActor
func showToast(_ message: String, into binding: Binding<String?>, for seconds: Double = 4) {
    withAnimation { binding.wrappedValue = message }
    Task {
        try? await Task.sleep(for: .seconds(seconds))
        withAnimation { binding.wrappedValue = nil }
    }
}
