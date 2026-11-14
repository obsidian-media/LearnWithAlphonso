import SwiftUI
import LearnWithAlphonsoKit

/// The one-time "What should other learners call you?" prompt. Shown after the first sign-in and before
/// placement while name_confirmed_at is NULL, including for learners whose old name failed the filter. All rules
/// and copy are the Kit's DisplayNameOnboarding (shared with the web).
struct NameOnboardingView: View {
    let session: Session
    let onFinish: () -> Void
    @State private var state: DisplayNameOnboarding
    @FocusState private var fieldFocused: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.alphonsoDS) private var ds

    init(session: Session, state: DisplayNameOnboarding, onFinish: @escaping () -> Void) {
        self.session = session
        self.onFinish = onFinish
        _state = State(initialValue: state)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                    Image("Alphonso-waving").resizable().scaledToFit()
                        .frame(height: AlphonsoDS.Space.s12 * 2)
                        .accessibilityHidden(true)
                    Text(NameOnboardingCopy.title)
                        .dsText(.display)
                        .foregroundStyle(ds.brand)
                        .accessibilityAddTraits(.isHeader)
                    Text(NameOnboardingCopy.publicNote)
                        .dsText(.body)
                        .foregroundStyle(ds.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)

                    // The generated handle is the placeholder, not text, so typing never appends to it. A real
                    // prefill (an Apple or Google given name) is text, with a clear button to replace it quickly.
                    HStack(spacing: AlphonsoDS.Space.s2) {
                        TextField(state.fieldPlaceholder, text: Binding(
                            get: { state.name },
                            // Ignore a set to the value already shown (SwiftUI can do this on focus).
                            set: { if $0 != state.name { state.edit($0) } }
                        ))
                        .dsText(.body)
                        .foregroundStyle(ds.ink)
                        .textFieldStyle(.plain)
                        .textContentType(.nickname)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .focused($fieldFocused)
                        .submitLabel(.done)
                        .onSubmit { Task { await save() } }
                        .accessibilityLabel(NameOnboardingCopy.fieldLabel)
                        if !state.name.isEmpty {
                            Button {
                                state.edit("")
                                fieldFocused = true
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(ds.inkSoft)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Clear name")
                        }
                    }
                    .padding(AlphonsoDS.Space.s3)
                    .frame(minHeight: AlphonsoDS.Space.minTouch)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
                    .overlay(
                        RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                            .strokeBorder(state.isProblem ? ds.wrongInk : (fieldFocused ? ds.choice : ds.line), lineWidth: 2))

                    if let message = state.message {
                        Text(message)
                            .dsText(.footnote)
                            .foregroundStyle(state.isProblem ? ds.wrongInk : ds.inkSoft)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Button {
                        Task { await save() }
                    } label: {
                        if state.isSubmitting {
                            ProgressView().tint(ds.onAction)
                        } else {
                            Text(NameOnboardingCopy.save)
                        }
                    }
                    .buttonStyle(.dsButton(.primary))
                    // Saving keeps the button fully opaque with its spinner; save() ignores a second tap.
                    .disabled(!state.canSave && !state.isSubmitting)
                    .accessibilityLabel(state.isSubmitting ? "Saving" : NameOnboardingCopy.save)

                    Button(NameOnboardingCopy.skip) {
                        Task { await skip() }
                    }
                    .buttonStyle(.dsButton(.secondary))
                    .disabled(!state.canSkip)

                    Text(NameOnboardingCopy.skipNote(currentName: state.currentName))
                        .dsText(.caption)
                        .foregroundStyle(ds.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(AlphonsoDS.Space.s4)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card.opacity(0.94)))
                .padding(AlphonsoDS.Space.s4)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .screenScene(.learn)
            .background(ds.surface)
            .scrollDismissesKeyboard(dynamicTypeSize.isAccessibilitySize ? .immediately : .interactively)
            // Save and Skip stay reachable above the keyboard however large the text is.
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Button(NameOnboardingCopy.skip) { Task { await skip() } }
                        .disabled(!state.canSkip)
                    Spacer()
                    Button(NameOnboardingCopy.save) { Task { await save() } }
                        .disabled(!state.canSave)
                }
            }
        }
        .interactiveDismissDisabled()
        // At the largest text sizes the keyboard would cover most of the screen on arrival and hide the heading.
        .onAppear { fieldFocused = !dynamicTypeSize.isAccessibilitySize }
        // Live check, debounced; a newer edit cancels this task and a stale answer is dropped by generation.
        .task(id: state.pendingCheck) {
            guard let generation = state.pendingCheck else { return }
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            guard let client = await makeClient() else {
                state.checkFailed(generation: generation)
                return
            }
            do {
                let problem = try await client.displayNameProblem(DisplayNameOnboarding.normalized(state.name))
                state.applyCheck(problem: problem, generation: generation)
            } catch {
                state.checkFailed(generation: generation)
            }
        }
    }

    private func makeClient() async -> ProgressSyncClient? {
        guard let token = await session.freshAccessToken() else { return nil }
        return ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
    }

    private func save() async {
        guard state.canSave, state.beginSubmit() else { return }
        guard let client = await makeClient() else {
            state.submitFailed(ProgressSyncError.server(status: 401, message: "unauthenticated"))
            return
        }
        do {
            _ = try await client.confirmDisplayName(DisplayNameOnboarding.normalized(state.name))
            state.submitSucceeded()
            onFinish()
        } catch {
            state.submitFailed(error)
        }
    }

    /// Skip never traps the learner: whether or not the server could record it, the prompt closes. A failure
    /// stamps nothing, so the prompt returns next launch (DisplayNameOnboarding.resolveSkip).
    private func skip() async {
        guard state.canSkip, state.beginSubmit() else { return }
        let outcome: Result<String, Error>
        if let client = await makeClient() {
            do {
                outcome = .success(try await client.skipDisplayNamePrompt())
            } catch {
                outcome = .failure(error)
            }
        } else {
            outcome = .failure(ProgressSyncError.server(status: 401, message: "unauthenticated"))
        }
        _ = DisplayNameOnboarding.resolveSkip(outcome)
        state.submitSucceeded()
        onFinish()
    }
}
