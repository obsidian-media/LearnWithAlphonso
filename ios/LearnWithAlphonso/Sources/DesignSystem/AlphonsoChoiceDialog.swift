import SwiftUI

/// The app's own choice sheet, used in place of the system `confirmationDialog`.
///
/// The system dialog draws its buttons in the global accent tint on iOS 26 glass, which reads as pale blue text on
/// grey glass and cannot be made readable from the app. This sheet draws every choice with design system colours
/// (ink on card, wrong-ink for destructive) so contrast comes from the tokens, in both palettes and in dark mode.
/// It keeps the same call shape as the system dialog, so a call site only changes its modifier name.
struct AlphonsoChoiceButtonStyle: PrimitiveButtonStyle {
    let dismiss: () -> Void
    @Environment(\.alphonsoDS) private var ds

    func makeBody(configuration: Configuration) -> some View {
        let destructive = configuration.role == .destructive
        let cancel = configuration.role == .cancel
        let shape = RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
        return Button {
            // The action first: a call site that clears its own state in the action must still see it set.
            configuration.trigger()
            dismiss()
        } label: {
            configuration.label
                .dsText(.headline)
                .foregroundStyle(destructive ? ds.wrongInk : ds.ink)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
                .padding(.horizontal, AlphonsoDS.Space.s4)
                .background(shape.fill(cancel ? ds.sunk : ds.card))
                .overlay(shape.strokeBorder(destructive ? ds.wrongEdge : ds.line, lineWidth: 1))
                .contentShape(shape)
        }
        .buttonStyle(.plain)
    }
}

private struct AlphonsoChoiceDialog<Actions: View, Message: View>: ViewModifier {
    let title: String
    @Binding var isPresented: Bool
    let actions: Actions
    let message: Message
    @Environment(\.alphonsoDS) private var ds

    func body(content: Content) -> some View {
        content.sheet(isPresented: $isPresented) {
            ScrollView {
                VStack(spacing: AlphonsoDS.Space.s3) {
                    Text(title)
                        .dsText(.title)
                        .foregroundStyle(ds.ink)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    message
                        .dsText(.footnote)
                        .foregroundStyle(ds.inkSoft)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    VStack(spacing: AlphonsoDS.Space.s2) {
                        actions
                    }
                    .buttonStyle(AlphonsoChoiceButtonStyle { isPresented = false })
                }
                .padding(AlphonsoDS.Space.s5)
            }
            .background(ds.surface.ignoresSafeArea())
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .presentationBackground(ds.surface)
        }
    }
}

extension View {
    /// A readable replacement for `confirmationDialog(_:isPresented:titleVisibility:actions:message:)`.
    func alphonsoChoiceDialog<Actions: View, Message: View>(
        _ title: String,
        isPresented: Binding<Bool>,
        @ViewBuilder actions: () -> Actions,
        @ViewBuilder message: () -> Message
    ) -> some View {
        modifier(AlphonsoChoiceDialog(title: title, isPresented: isPresented, actions: actions(), message: message()))
    }

    func alphonsoChoiceDialog<Actions: View>(
        _ title: String,
        isPresented: Binding<Bool>,
        @ViewBuilder actions: () -> Actions
    ) -> some View {
        alphonsoChoiceDialog(title, isPresented: isPresented, actions: actions, message: { EmptyView() })
    }
}
