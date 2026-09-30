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
///
/// 2026-09-29 pre-submission audit (Guideline 5.1.2(i): explicit
/// permission before sharing personal data with third-party AI): the
/// sheet used to offer only "Got it" and could not be dismissed, so it
/// was a forced acknowledgement rather than a choice. It now names the
/// providers and offers "Not now", which backs out of the screen (a
/// pushed lesson/review pops) and, where there is nothing to back out to
/// (the Practice and Hector tab roots), shows a placeholder in place of
/// the AI feature until the learner allows it.
private struct AIDisclosureGateModifier: ViewModifier {
    @Environment(\.dismiss) private var dismiss
    @State private var isAllowed = AIDisclosureGate.isAcknowledged()
    @State private var showDisclosure = !AIDisclosureGate.isAcknowledged()

    func body(content: Content) -> some View {
        Group {
            if isAllowed {
                content
            } else {
                ContentUnavailableView {
                    Label("AI practice is off", systemImage: "sparkles")
                } description: {
                    Text("This feature sends your voice or answers to our speech and AI providers. Allow it to continue.")
                } actions: {
                    Button("Review and allow") { showDisclosure = true }
                        .buttonStyle(.alphonsoPrimary)
                }
            }
        }
        .onAppear {
            // Allowed on another screen since this one was first built
            // (e.g. a tab visited, declined, then allowed inside a lesson).
            if !isAllowed && AIDisclosureGate.isAcknowledged() {
                isAllowed = true
                showDisclosure = false
            }
        }
        .sheet(isPresented: $showDisclosure) {
            AIDisclosureSheet(
                onAllow: {
                    AIDisclosureGate.acknowledge()
                    isAllowed = true
                    showDisclosure = false
                },
                onDecline: {
                    showDisclosure = false
                    dismiss()
                }
            )
            // A swipe would be an answer that is neither yes nor no; both
            // buttons below are explicit.
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
    let onAllow: () -> Void
    let onDecline: () -> Void

    private var privacyPolicyURL: URL {
        AppConfig.apiBaseURL.appendingPathComponent("privacy")
    }

    var body: some View {
        ScrollView {
            sheetContent
        }
        .background(AlphonsoColor.surface)
        // The longer provider-naming copy plus two buttons no longer fits
        // a .medium sheet at large Dynamic Type sizes.
        .presentationDetents([.medium, .large])
    }

    private var sheetContent: some View {
        VStack(spacing: AlphonsoSpacing.lg) {
            Text("How Alphonso uses AI")
                .font(AlphonsoFont.display(22, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
                .multilineTextAlignment(.center)

            Text("To transcribe your speech, reply to you and check your answers, Alphonso sends your voice recordings to Deepgram (speech recognition and spoken replies) and your conversation text and written answers to NVIDIA (AI replies and grading). Nothing is sent until you allow it.")
                .font(AlphonsoFont.sans(14))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)

            Link("Read our Privacy Policy", destination: privacyPolicyURL)
                .font(AlphonsoFont.sans(13, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.moss)

            Button("Allow", action: onAllow)
                .buttonStyle(.alphonsoPrimary)

            Button("Not now", action: onDecline)
                .font(AlphonsoFont.sans(14, weight: .medium))
                .tint(AlphonsoColor.inkSoft)
        }
        .padding()
        .frame(maxWidth: 360)
        .frame(maxWidth: .infinity)
    }
}
