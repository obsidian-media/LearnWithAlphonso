import SwiftUI
import LearnWithAlphonsoKit

/// Long-press any AI message to report it into the moderation queue (content_reports, kind 'ai_response'; the owner
/// is emailed by the report trigger). Attached to the Hector, practice and campaign bubbles with one line each.
private struct ReportableAIMessage: ViewModifier {
    let enabled: Bool
    let makeReport: (AIResponseReportReason) -> AIResponseReport
    let session: Session
    @State private var showingReasons = false
    @State private var resultMessage: String?

    func body(content: Content) -> some View {
        if enabled {
            content
                .contextMenu {
                    Button { showingReasons = true } label: {
                        Label(AIConsentCopy.reportAction, systemImage: "flag")
                    }
                }
                .accessibilityAction(named: Text(AIConsentCopy.reportAction)) { showingReasons = true }
                .confirmationDialog(AIConsentCopy.reportAction, isPresented: $showingReasons, titleVisibility: .visible) {
                    ForEach(AIResponseReportReason.allCases, id: \.self) { reason in
                        Button(reason.label) { Task { await send(makeReport(reason)) } }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text(AIConsentCopy.reportReviewNote)
                }
                .alert(
                    resultMessage ?? "",
                    isPresented: Binding(get: { resultMessage != nil }, set: { if !$0 { resultMessage = nil } })
                ) {
                    Button("OK", role: .cancel) {}
                }
        } else {
            content
        }
    }

    private func send(_ report: AIResponseReport) async {
        guard let token = await session.freshAccessToken() else {
            resultMessage = AIConsentCopy.reportFailed
            return
        }
        let client = ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL,
            anonKey: AppConfig.supabasePublishableKey,
            accessToken: token)
        do {
            try await client.reportAIResponse(report)
            resultMessage = AIConsentCopy.reportThanks
        } catch {
            resultMessage = AIConsentCopy.reportFailed
        }
    }
}

extension View {
    /// One-line attach for an AI message bubble. `enabled` is false for the learner's own turns and for fixed
    /// opening lines (written by us, not the model).
    func reportableAIMessage(
        _ text: String,
        enabled: Bool,
        surface: AIResponseSurface,
        course: String,
        scenarioID: String? = nil,
        campaignID: String? = nil,
        sceneIndex: Int? = nil,
        session: Session
    ) -> some View {
        modifier(ReportableAIMessage(
            enabled: enabled,
            makeReport: { reason in
                AIResponseReport(
                    message: text, surface: surface, course: course, reason: reason,
                    scenarioID: scenarioID, campaignID: campaignID, sceneIndex: sceneIndex)
            },
            session: session))
    }
}
