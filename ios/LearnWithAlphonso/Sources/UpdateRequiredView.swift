import SwiftUI
import LearnWithAlphonsoKit

/// Shown instead of the app when the server says this build is below the lowest one it still supports
/// (AppUpdateGate, `GET /api/app-config`). Off unless the owner sets a minimum.
struct UpdateRequiredView: View {
    let requirement: AppUpdateGate.Requirement
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: AlphonsoSpacing.lg) {
            Spacer()
            Text("Please update Alphonso")
                .font(AlphonsoFont.display(24, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text("This version of the app is no longer supported. Update to the latest version to keep learning. Your progress is saved to your account.")
                .font(AlphonsoFont.sans(15))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
            if let store = requirement.storeURL {
                Button("Update in the App Store") { openURL(store) }
                    .buttonStyle(.alphonsoPrimary)
            } else {
                Text("Open the App Store and update Learn with Alphonso.")
                    .font(AlphonsoFont.sans(14, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)
                    .multilineTextAlignment(.center)
            }
            Spacer()
        }
        .padding(AlphonsoSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AlphonsoColor.surface.ignoresSafeArea())
        // Covers the whole app: nothing underneath can be tapped or reached with VoiceOver.
        .contentShape(Rectangle())
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }
}
