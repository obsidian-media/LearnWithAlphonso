import SwiftUI
import LearnWithAlphonsoKit

/// The single place every AI entry point (ConversationView, HectorView,
/// CampaignView, SpeakQuestionCard, LessonPlayerView, ReviewQueueView)
/// checks and shows the AI-processing disclosure -- see AIDisclosureGate
/// (Kit) for the persisted acknowledgement itself. A gate duplicated into
/// each screen instead of called from each screen is how some of these
/// end up missing it, so this stays the only place that decides whether
/// to show it.
///
/// 2026-09-30 audit (Codex/Fable): LessonPlayerView and ReviewQueueView
/// both send a learner's written translation answer to NVIDIA for AI
/// grading (settledTranslationVerdict / grade-review) with no disclosure
/// gate at all -- this sheet's copy previously only mentioned voice, on
/// the assumption its four callers were the only screens that ever
/// reached an AI vendor. One shared acknowledgement flag covers both
/// kinds of AI processing now, so the copy does too.
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
            Text("How Alphonso uses AI")
                .font(AlphonsoFont.display(22, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
                .multilineTextAlignment(.center)

            Text("Your voice recordings, and written answers you submit for grading, are sent to our speech-processing and AI providers so Alphonso can transcribe your speech and check your answers.")
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
