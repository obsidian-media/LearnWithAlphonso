import SwiftUI
import LearnWithAlphonsoKit

/// The single place every AI entry point (ConversationView, HectorView, CampaignView, SpeakQuestionCard,
/// LessonPlayerView, ReviewQueueView) checks and shows the AI-processing disclosure. A gate duplicated into each
/// screen instead of called from each screen is how some of these end up missing it, so this stays the only place
/// that decides whether to show it.
///
/// History: the sheet used to be a forced "Got it", then (2026-09-29, Guideline 5.1.2(i)) an explicit Allow / Not now
/// choice naming the providers; lessons and review used to be wrapped in the gate wholesale, which made "Not now"
/// pop the learner out of every lesson (BACKLOG 0.0-z #2).
///
/// Since AI consent moved onto the account, the choice is stored through `AIConsentStore` (the same answer on iOS and
/// the web, withdrawable from Settings on either); this file never writes UserDefaults itself.
///
/// The whole-screen gate is for screens that ARE AI only (`AIConsentPolicy.blocksWholeScreen`): Hector, practice
/// conversations, campaigns. Two rules shape it:
/// - The screen is never mounted before consent has been seen (nothing may record, speak or send on its behalf), but
///   once it has been shown it is NEVER unmounted. If consent is withdrawn elsewhere, or a read fails, the prompt
///   covers the live screen, so a conversation in progress keeps its transcript and the text being typed.
/// - A setting that could not be read is "unavailable" with a retry, never "AI is off": a database blip must not tell
///   someone who consented that they did not.
private struct AIDisclosureGateModifier: ViewModifier {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var aiConsent: AIConsentStore
    /// Optional, so a screen built outside the app's root (a preview) reads "connected" instead of crashing.
    @Environment(NetworkMonitor.self) private var networkMonitor: NetworkMonitor?
    private var isConnected: Bool { networkMonitor?.isConnected ?? true }
    @State private var hasBeenGranted = false
    @State private var didRefresh = false
    @State private var showDisclosure = false
    @State private var isSaving = false
    @State private var saveError: String?
    @Environment(\.alphonsoDS) private var ds

    /// Every decision about what is on screen is `AIConsentGate.presentation` (Kit, tested): mounted or not, spinner,
    /// prompt or cover. This view only draws it.
    private var presentation: AIConsentGatePresentation {
        AIConsentGate.presentation(
            status: aiConsent.status, hasBeenShown: hasBeenGranted, didRefresh: didRefresh)
    }

    func body(content: Content) -> some View {
        Group {
            switch presentation {
            case .content(let covered):
                content
                    .disabled(covered != nil)
                    .accessibilityHidden(covered != nil)
                    .overlay {
                        if let covered {
                            prompt(covered)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(ds.surface.opacity(0.96))
                        }
                    }
            case .prompt(let kind):
                prompt(kind).background(ds.surface)
            case .spinner:
                // Unknown yet (fresh install, first read in flight): never prompt someone who may have consented
                // on another device.
                ProgressView().tint(ds.choice)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(ds.surface)
            }
        }
        .onChange(of: aiConsent.isGranted, initial: true) { _, granted in
            if granted { hasBeenGranted = true }
        }
        .task {
            await aiConsent.refresh()
            didRefresh = true
            // First visit with a definite "no": ask straight away. Mid-session, the learner chooses.
            if !hasBeenGranted && aiConsent.status == .denied { showDisclosure = true }
        }
        .sheet(isPresented: $showDisclosure) {
            AIDisclosureSheet(
                isSaving: isSaving,
                errorMessage: saveError,
                onAllow: { Task { await allow() } },
                onDecline: {
                    showDisclosure = false
                    // Only a screen that was never shown has somewhere to back out to; a live conversation stays.
                    if !hasBeenGranted { dismiss() }
                })
            .interactiveDismissDisabled()
        }
    }

    @ViewBuilder
    private func prompt(_ kind: AIConsentGatePrompt) -> some View {
        if kind == .retry {
            // With no connection the setting was never the problem: say "offline", not "couldn't check your AI
            // setting", which reads as something the learner has to fix in Settings.
            DSEmptyState(
                art: "Alphonso-explaining-pointer",
                title: isConnected ? AIConsentCopy.checkFailedTitle : AIConsentCopy.offlineTitle,
                message: isConnected ? AIConsentCopy.checkFailedBody : AIConsentCopy.offlineBody,
                actionTitle: AIConsentCopy.retry,
                action: { Task { await aiConsent.refresh() } })
                .padding(AlphonsoDS.Space.gutter)
        } else {
            DSEmptyState(
                emoji: "\u{2728}",
                title: AIConsentCopy.gateTitle,
                message: AIConsentCopy.gateBody,
                actionTitle: AIConsentCopy.gateAction,
                action: { showDisclosure = true })
                .padding(AlphonsoDS.Space.gutter)
        }
    }

    private func allow() async {
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            try await aiConsent.set(true)
            showDisclosure = false
        } catch {
            saveError = AIConsentCopy.saveFailed
        }
    }
}

private struct AIDisclosureOnDemandModifier: ViewModifier {
    @Binding var isPresented: Bool
    let onAllow: () -> Void
    @EnvironmentObject private var aiConsent: AIConsentStore
    @State private var isSaving = false
    @State private var saveError: String?

    func body(content: Content) -> some View {
        content.sheet(isPresented: $isPresented) {
            AIDisclosureSheet(
                isSaving: isSaving,
                errorMessage: saveError,
                onAllow: { Task { await allow() } },
                onDecline: { isPresented = false })
            .interactiveDismissDisabled()
        }
    }

    private func allow() async {
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            try await aiConsent.set(true)
            isPresented = false
            onAllow()
        } catch {
            saveError = AIConsentCopy.saveFailed
        }
    }
}

extension View {
    /// Whole-screen consent wall. Only for screens that ARE AI (AIConsentPolicy.blocksWholeScreen): Hector,
    /// practice conversations, campaigns. Never on lessons, review or placement.
    func aiDisclosureGate() -> some View {
        modifier(AIDisclosureGateModifier())
    }

    /// The same sheet on demand, for a screen with a working non-AI path ("Use your voice instead",
    /// "Turn on AI grading", Save word, the Settings toggle). "Not now" just closes it.
    func aiDisclosureSheet(isPresented: Binding<Bool>, onAllow: @escaping () -> Void) -> some View {
        modifier(AIDisclosureOnDemandModifier(isPresented: isPresented, onAllow: onAllow))
    }
}

private struct AIDisclosureSheet: View {
    let isSaving: Bool
    let errorMessage: String?
    let onAllow: () -> Void
    let onDecline: () -> Void
    @Environment(\.alphonsoDS) private var ds

    private var privacyPolicyURL: URL { AppConfig.apiBaseURL.appendingPathComponent("privacy") }

    var body: some View {
        ScrollView { sheetContent }
            .background(ds.surface)
            // The longer provider-naming copy plus two buttons no longer fits a .medium sheet at large Dynamic Type
            // sizes.
            .presentationDetents([.medium, .large])
    }

    private var sheetContent: some View {
        VStack(spacing: AlphonsoDS.Space.s4) {
            Image("Alphonso-explaining-pointer").resizable().scaledToFit()
                .frame(height: AlphonsoDS.Space.s12 * 2)
                .accessibilityHidden(true)
            Text(AIConsentCopy.sheetTitle)
                .dsText(.title)
                .foregroundStyle(ds.ink)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            // The legal copy is verbatim; only its container is the design system's.
            Text(AIConsentCopy.sheetBody)
                .dsText(.footnote)
                .foregroundStyle(ds.inkSoft)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            Link(AIConsentCopy.privacyLink, destination: privacyPolicyURL)
                .dsText(.footnote)
                .foregroundStyle(ds.choice)
            if let errorMessage {
                Text(errorMessage)
                    .dsText(.footnote)
                    .foregroundStyle(ds.wrongInk)
                    .multilineTextAlignment(.center)
            }
            Button(action: onAllow) {
                if isSaving { ProgressView().tint(ds.onAction) } else { Text(AIConsentCopy.allow) }
            }
            .buttonStyle(.dsButton(.primary))
            .disabled(isSaving)
            Button(AIConsentCopy.notNow, action: onDecline)
                .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                .disabled(isSaving)
        }
        .padding(AlphonsoDS.Space.gutter)
        .frame(maxWidth: 360)
        .frame(maxWidth: .infinity)
    }
}
