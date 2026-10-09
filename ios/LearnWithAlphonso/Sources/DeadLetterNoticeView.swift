import SwiftUI
import LearnWithAlphonsoKit

/// A Learn-tab row shown when a finished lesson could not be saved and will not be
/// retried. "Contact support" opens a prefilled email; "Dismiss" hides the notice and keeps the record.
/// Dynamic Type: no line limits, and the buttons stack vertically when they no longer fit side by side.
struct DeadLetterNoticeSection: View {
    let syncQueueStore: SyncQueueStore
    @State private var dismissRevision = 0

    private let dismissals = DeadLetterDismissals()

    var body: some View {
        let _ = dismissRevision
        let letters = syncQueueStore.lessonDeadLetters
        let visible = DeadLetterNotice.visible(lessonIdentities: letters.map(\.identity), dismissed: dismissals.dismissed)
        if let message = DeadLetterNotice.message(count: visible.count) {
            Section {
                VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                    HStack(alignment: .firstTextBaseline, spacing: AlphonsoSpacing.sm) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(AlphonsoColor.ember)
                            .accessibilityHidden(true)
                        Text(message)
                            .font(AlphonsoFont.sans(15, weight: .medium))
                            .foregroundStyle(AlphonsoColor.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: AlphonsoSpacing.sm) { actions(visible: visible, letters: letters) }
                        VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) { actions(visible: visible, letters: letters) }
                    }
                    Text(DeadLetterNotice.supportAddress)
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                        .textSelection(.enabled)
                }
                .padding(.vertical, AlphonsoSpacing.xs)
                .accessibilityElement(children: .contain)
            }
            .listRowBackground(AlphonsoColor.parchment)
            .onAppear { dismissals.prune(keeping: letters.map(\.identity)) }
        }
    }

    @ViewBuilder
    private func actions(visible: [String], letters: [(identity: String, reason: String)]) -> some View {
        let reasons = visible.map { id in letters.first { $0.identity == id }?.reason ?? "unknown" }
        if let url = DeadLetterNotice.supportMailURL(identities: visible, reasons: reasons, appVersion: Self.appVersion) {
            Link(DeadLetterNotice.contactTitle, destination: url)
                .buttonStyle(.alphonsoSecondary(fullWidth: false))
        }
        Button(DeadLetterNotice.dismissTitle) {
            dismissals.dismiss(visible)
            dismissRevision += 1
        }
        .buttonStyle(.alphonsoSecondary(fullWidth: false))
    }

    private static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }
}
