import SwiftUI
import LearnWithAlphonsoKit

/// A Learn-tab row shown when a finished lesson could not be saved and will not be
/// retried. "Contact support" opens a prefilled email; "Dismiss" hides the notice and keeps the record.
/// Dynamic Type: no line limits, and the buttons stack vertically when they no longer fit side by side.
struct DeadLetterNoticeSection: View {
    let syncQueueStore: SyncQueueStore
    @State private var dismissRevision = 0
    @Environment(\.alphonsoDS) private var ds

    private let dismissals = DeadLetterDismissals()

    var body: some View {
        let _ = dismissRevision
        let letters = syncQueueStore.lessonDeadLetters
        let visible = DeadLetterNotice.visible(lessonIdentities: letters.map(\.identity), dismissed: dismissals.dismissed)
        if let message = DeadLetterNotice.message(count: visible.count) {
            DSCard(spacing: AlphonsoDS.Space.s2) {
                HStack(alignment: .center, spacing: AlphonsoDS.Space.s3) {
                    Image("Alphonso-hearts-calm").resizable().scaledToFit()
                        .frame(height: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s2)
                        .accessibilityHidden(true)
                    Text(message).dsText(.headline).foregroundStyle(ds.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: AlphonsoDS.Space.s2) { actions(visible: visible, letters: letters) }
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) { actions(visible: visible, letters: letters) }
                }
                Text(DeadLetterNotice.supportAddress)
                    .dsText(.caption)
                    .foregroundStyle(ds.inkSoft)
                    .textSelection(.enabled)
            }
            .accessibilityElement(children: .contain)
            .dsListRow(top: AlphonsoDS.Space.s2)
            .onAppear { dismissals.prune(keeping: letters.map(\.identity)) }
        }
    }

    @ViewBuilder
    private func actions(visible: [String], letters: [(identity: String, reason: String)]) -> some View {
        let reasons = visible.map { id in letters.first { $0.identity == id }?.reason ?? "unknown" }
        if let url = DeadLetterNotice.supportMailURL(identities: visible, reasons: reasons, appVersion: Self.appVersion) {
            Link(DeadLetterNotice.contactTitle, destination: url)
                .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
        }
        Button(DeadLetterNotice.dismissTitle) {
            dismissals.dismiss(visible)
            dismissRevision += 1
        }
        .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
    }

    private static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }
}
