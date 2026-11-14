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
        VStack(spacing: AlphonsoDS.Space.s3) {
            Spacer()
            DSEmptyState(
                art: "Alphonso-hearts-calm",
                title: "Couldn't save this lesson",
                message: [error.userMessage, error.supportLine].compactMap { $0 }.joined(separator: "\n"))
            if error == .unauthorized {
                // Signing out routes RootView to AuthView; the session lifecycle clears this account's local data.
                Button("Sign in", action: onSignIn).buttonStyle(.dsButton(.primary))
            }
            Button("Done", action: onDone).buttonStyle(.dsButton(.secondary))
            Spacer()
        }
        .padding(AlphonsoDS.Space.gutter)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ds.surface)
    }
}
