import SwiftUI
import LearnWithAlphonsoKit

/// Shown instead of the app when the server says this build is below the lowest one it still supports
/// (AppUpdateGate, `GET /api/app-config`). Off unless the owner sets a minimum.
struct UpdateRequiredView: View {
    let requirement: AppUpdateGate.Requirement
    @Environment(\.openURL) private var openURL
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        // Scrolls: nothing clips at the largest text sizes or in landscape, and this screen covers the whole app.
        ScrollView {
            VStack(spacing: AlphonsoDS.Space.s4) {
                Image("Alphonso-welcome-door").resizable().scaledToFit()
                    .frame(height: AlphonsoDS.Space.s12 * 4)
                    .accessibilityHidden(true)
                DSCard(spacing: AlphonsoDS.Space.s2) {
                    Text("Please update Alphonso")
                        .dsText(.display)
                        .foregroundStyle(ds.brand)
                        .accessibilityAddTraits(.isHeader)
                    Text("This version of the app is no longer supported. Update to the latest version to keep learning. Your progress is saved to your account.")
                        .dsText(.body)
                        .foregroundStyle(ds.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let store = requirement.storeURL {
                    Button("Update in the App Store") { openURL(store) }
                        .buttonStyle(.dsButton(.primary))
                } else {
                    DSCard {
                        Text("Open the App Store and update Learn with Alphonso.")
                            .dsText(.headline)
                            .foregroundStyle(ds.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(AlphonsoDS.Space.s6)
            .frame(maxWidth: .infinity)
        }
        .screenScene(.learn)
        .background(ds.surface.ignoresSafeArea())
        // Covers the whole app: nothing underneath can be tapped or reached with VoiceOver.
        .contentShape(Rectangle())
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }
}
