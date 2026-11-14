import SwiftUI
import LearnWithAlphonsoKit

/// A completion the server will never accept (a rejected 4xx) or cannot accept (signed out). It names the real
/// cause (never "offline"), gives the support path for a rejection, and offers "Sign in" when signed out.
struct LessonSaveFailureView: View {
    let error: LessonCompletionError
    let onSignIn: () -> Void
    let onDone: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        // Scrolls so the buttons stay reachable at the largest text sizes and in landscape.
        ScrollView {
            VStack(spacing: AlphonsoDS.Space.s3) {
                Image("Alphonso-hearts-calm").resizable().scaledToFit()
                    .frame(height: AlphonsoDS.Space.s12 * 3)
                    .accessibilityHidden(true)
                DSCard(spacing: AlphonsoDS.Space.s2) {
                    Text("Couldn't save this lesson").dsText(.title).foregroundStyle(ds.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(error.userMessage).dsText(.footnote).foregroundStyle(ds.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                    if let support = error.supportLine {
                        Text(support).dsText(.caption).foregroundStyle(ds.inkSoft)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if error == .unauthorized {
                    // Signing out routes RootView to AuthView; the session lifecycle clears this account's local data.
                    Button("Sign in", action: onSignIn).buttonStyle(.dsButton(.primary))
                }
                Button("Done", action: onDone).buttonStyle(.dsButton(.secondary))
            }
            .padding(AlphonsoDS.Space.gutter)
            .frame(maxWidth: .infinity)
        }
        .background(ds.surface)
    }
}
