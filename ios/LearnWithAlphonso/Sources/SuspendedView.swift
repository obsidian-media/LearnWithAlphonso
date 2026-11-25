import SwiftUI
import LearnWithAlphonsoKit

/// Shown instead of the app for a suspended (banned) account (backlog item 87): after a banned sign-in, or when a
/// ban ends the session. The words are the web SuspendedScreen's (AccountSuspension). Android's SuspendedScreen is
/// the twin.
struct SuspendedView: View {
    let onSignOut: () -> Void
    /// The API sends no reason today; a future response can pass one.
    var reason: String?
    @Environment(\.openURL) private var openURL
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let content = AccountSuspension.content(reason: reason)
        // Scrolls: nothing clips at the largest Dynamic Type sizes or in landscape.
        ScrollView {
            VStack(spacing: AlphonsoDS.Space.s4) {
                DSCard(spacing: AlphonsoDS.Space.s2) {
                    Text(content.title)
                        .dsText(.display)
                        .foregroundStyle(ds.ink)
                        .accessibilityAddTraits(.isHeader)
                    if let reason = content.reason {
                        Text(reason)
                            .dsText(.headline)
                            .foregroundStyle(ds.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text(content.body)
                        .dsText(.body)
                        .foregroundStyle(ds.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button(AccountSuspension.contactTitle) { openURL(AccountSuspension.contactURL) }
                    .buttonStyle(.dsButton(.primary))
                    .accessibilityLabel(content.contactLabel)
                Button(AccountSuspension.signOutTitle, action: onSignOut)
                    .buttonStyle(.dsButton(.secondary))
                    .accessibilityLabel(content.signOutLabel)
            }
            .padding(AlphonsoDS.Space.s6)
            .frame(maxWidth: .infinity)
        }
        .background(ds.surface.ignoresSafeArea())
        // Covers the whole app: nothing underneath can be reached with VoiceOver.
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }
}
