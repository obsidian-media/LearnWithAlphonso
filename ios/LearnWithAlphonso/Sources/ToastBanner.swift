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
    /// Nil is the design system's action text colour.
    var iconColor: Color?

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s2) {
            Image(systemName: iconName)
                .foregroundStyle(iconColor ?? ds.actionText)
                .accessibilityHidden(true)
            Text(message)
                .dsText(.footnote)
                .foregroundStyle(ds.ink)
        }
        .padding(.horizontal, AlphonsoDS.Space.s4)
        .padding(.vertical, AlphonsoDS.Space.s3)
        .background(ds.card, in: Capsule())
        .overlay(Capsule().strokeBorder(ds.line, lineWidth: 1))
        .dsElevation(AlphonsoDS.Elevation.floating, line: ds.line)
        .accessibilityElement(children: .combine)
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
