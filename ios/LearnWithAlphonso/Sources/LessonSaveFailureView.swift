import SwiftUI
import LearnWithAlphonsoKit

/// A completion the server will never accept (a rejected 4xx) or cannot accept (signed out). It names the real
/// cause (never "offline"), gives the support path for a rejection, and offers "Sign in" when signed out.
struct LessonSaveFailureView: View {
    let error: LessonCompletionError
    let onSignIn: () -> Void
    let onDone: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Couldn't save this lesson", systemImage: error == .unauthorized ? "person.crop.circle.badge.exclamationmark" : "exclamationmark.triangle")
        } description: {
            VStack(spacing: AlphonsoSpacing.xs) {
                Text(error.userMessage)
                if let support = error.supportLine { Text(support).font(AlphonsoFont.sans(13)) }
            }
        } actions: {
            if error == .unauthorized {
                // Signing out routes RootView to AuthView; the session lifecycle clears this account's local data.
                Button("Sign in", action: onSignIn).buttonStyle(.alphonsoPrimary)
            }
            Button("Done", action: onDone).buttonStyle(.alphonsoSecondary)
        }
    }
}
