import SwiftUI
import LearnWithAlphonsoKit

/// The single place all four AI entry points (ConversationView, HectorView,
/// CampaignView, SpeakQuestionCard) check and show the AI-processing
/// disclosure -- see AIDisclosureGate (Kit) for the persisted
/// acknowledgement itself. A gate duplicated into each screen instead of
/// called from each screen is how one of the four ends up missing it, so
/// this stays the only place that decides whether to show it.
private struct AIDisclosureGateModifier: ViewModifier {
    @State private var showDisclosure = !AIDisclosureGate.isAcknowledged()

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $showDisclosure) {
                AIDisclosureSheet {
                    AIDisclosureGate.acknowledge()
                    showDisclosure = false
                }
                // Requires the explicit "Got it" tap below, not a swipe,
                // so the sheet being on screen at all means the learner
                // has not yet acknowledged it -- a swipe-to-dismiss would
                // let the very first AI interaction happen with nothing
                // acknowledged.
                .interactiveDismissDisabled()
            }
    }
}

extension View {
    /// Shows the AI-processing disclosure once, before the learner's first
    /// AI interaction on this screen, and never again once acknowledged.
    func aiDisclosureGate() -> some View {
        modifier(AIDisclosureGateModifier())
    }
}

private struct AIDisclosureSheet: View {
    let onAcknowledge: () -> Void

    private var privacyPolicyURL: URL {
        AppConfig.apiBaseURL.appendingPathComponent("privacy")
    }

    var body: some View {
        VStack(spacing: AlphonsoSpacing.lg) {
            Text("How Alphonso uses your voice")
                .font(AlphonsoFont.display(22, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
                .multilineTextAlignment(.center)

            Text("Your voice recordings are sent to our speech-processing and AI providers so Alphonso can transcribe your speech and generate a response.")
                .font(AlphonsoFont.sans(14))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)

            Link("Read our Privacy Policy", destination: privacyPolicyURL)
                .font(AlphonsoFont.sans(13, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.moss)

            Button("Got it", action: onAcknowledge)
                .buttonStyle(.alphonsoPrimary)
        }
        .padding()
        .frame(maxWidth: 360)
        .background(AlphonsoColor.surface)
        .presentationDetents([.medium])
    }
}
