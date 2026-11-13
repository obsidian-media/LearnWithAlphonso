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
        resultMessage = await sendAIResponseReport(report, session: session)
    }
}

/// Posts one report and returns the message to show (thanks, or why it failed). Shared by the long-press menu and
/// the explicit "Not clear?" button under an explanation.
@MainActor
func sendAIResponseReport(_ report: AIResponseReport, session: Session) async -> String {
    guard let token = await session.freshAccessToken() else { return AIConsentCopy.reportFailed }
    let client = ProgressSyncClient(
        supabaseURL: AppConfig.supabaseURL,
        anonKey: AppConfig.supabasePublishableKey,
        accessToken: token)
    do {
        try await client.reportAIResponse(report)
        return AIConsentCopy.reportThanks
    } catch {
        return AIConsentCopy.reportFailed
    }
}

/// An explicit report button ("Not clear?" under an explanation): the same reasons, the same queue, the same notes as
/// the long-press menu.
struct AIReportButton: View {
    let message: String
    let surface: AIResponseSurface
    let course: String
    let label: String
    let session: Session
    @State private var showingReasons = false
    @State private var resultMessage: String?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(label) { showingReasons = true }
            .buttonStyle(.plain)
            .dsText(.caption)
            .foregroundStyle(ds.inkSoft)
            .underline()
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            .accessibilityLabel("\(label) Report this explanation")
            .confirmationDialog(AIConsentCopy.reportAction, isPresented: $showingReasons, titleVisibility: .visible) {
                ForEach(AIResponseReportReason.allCases, id: \.self) { reason in
                    Button(reason.label) {
                        let report = AIResponseReport(message: message, surface: surface, course: course, reason: reason)
                        Task { resultMessage = await sendAIResponseReport(report, session: session) }
                    }
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
