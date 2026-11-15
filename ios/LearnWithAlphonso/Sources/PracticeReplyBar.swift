import SwiftUI
import LearnWithAlphonsoKit

/// The chat-mode reply bar (Round 13, mock 2b): one docked glass row with a pill field ("Your reply") and a round gold
/// send button (arrow up). The send button is dimmed and inert while the field is empty or a reply is pending
/// (`PracticeHub.canSendReply`); the focused field takes the choice border. Chat mode is typed only, so there is no mic.
struct PracticeReplyBar: View {
    @Binding var text: String
    /// A reply is still on its way, or the call is ending.
    let pending: Bool
    let send: () -> Void
    @FocusState private var focused: Bool
    @Environment(\.alphonsoDS) private var ds

    private var canSend: Bool { PracticeHub.canSendReply(text, pending: pending) }

    var body: some View {
        HStack(alignment: .bottom, spacing: AlphonsoDS.Space.s2) {
            TextField("", text: $text, prompt: Text("Your reply").foregroundStyle(ds.inkFaint), axis: .vertical)
                .dsText(.body)
                .foregroundStyle(ds.ink)
                .lineLimit(1...5)
                .textFieldStyle(.plain)
                .focused($focused)
                .padding(.horizontal, AlphonsoDS.Space.s4)
                .padding(.vertical, AlphonsoDS.Space.s3)
                .frame(minHeight: AlphonsoDS.Space.minTouch)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble + 1, style: .continuous).fill(ds.card))
                .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble + 1, style: .continuous).strokeBorder(focused ? ds.choice : ds.line, lineWidth: 2))
                .accessibilityLabel("Your reply")
            Button(action: send) {
                Image(systemName: "arrow.up")
                    .font(.body.weight(.heavy))
                    .foregroundStyle(ds.onAction)
                    .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                    .background(Circle().fill(LinearGradient(stops: [.init(color: ds.actionHi, location: 0), .init(color: ds.action, location: 0.55)], startPoint: .top, endPoint: .bottom)))
                    .opacity(canSend ? 1 : 0.4)
            }
            .disabled(!canSend)
            .accessibilityLabel("Send")
        }
        .padding(.horizontal, AlphonsoDS.Space.s4)
        .padding(.top, AlphonsoDS.Space.s2)
        .padding(.bottom, AlphonsoDS.Space.s3)
        .background { ds.card.opacity(0.82).ignoresSafeArea(edges: .bottom) }
        .overlay(alignment: .top) { Rectangle().fill(ds.line).frame(height: 1) }
    }
}
