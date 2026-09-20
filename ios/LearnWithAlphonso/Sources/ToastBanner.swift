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
    var iconColor = Color.orange

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: iconName)
                .foregroundStyle(iconColor)
            Text(message)
                .font(.subheadline.weight(.medium))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: Capsule())
        .shadow(radius: 4)
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
