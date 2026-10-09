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

    init(session: Session, state: DisplayNameOnboarding, onFinish: @escaping () -> Void) {
        self.session = session
        self.onFinish = onFinish
        _state = State(initialValue: state)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
                    Text(NameOnboardingCopy.title)
                        .font(AlphonsoFont.display(26, weight: .semiBold))
                        .foregroundStyle(AlphonsoColor.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(NameOnboardingCopy.publicNote)
                        .font(AlphonsoFont.sans(14))
                        .foregroundStyle(AlphonsoColor.inkSoft)

                    // The generated handle is the placeholder, not text, so typing never appends to it. A real
                    // prefill (an Apple or Google given name) is text, with a clear button to replace it quickly.
                    HStack(spacing: AlphonsoSpacing.sm) {
                        TextField(state.fieldPlaceholder, text: Binding(
                            get: { state.name },
                            // Ignore a set to the value already shown (SwiftUI can do this on focus).
                            set: { if $0 != state.name { state.edit($0) } }
                        ))
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
                                    .foregroundStyle(AlphonsoColor.inkSoft)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Clear name")
                        }
                    }
                    .padding(AlphonsoSpacing.sm + 2)
                    .alphonsoInputBackground()

                    if let message = state.message {
                        Text(message)
                            .font(AlphonsoFont.sans(13))
                            .foregroundStyle(state.isProblem ? AlphonsoColor.destructive : AlphonsoColor.inkSoft)
                    }

                    Button {
                        Task { await save() }
                    } label: {
                        if state.isSubmitting {
                            ProgressView().tint(AlphonsoColor.surface)
                        } else {
                            Text(NameOnboardingCopy.save)
                        }
                    }
                    .buttonStyle(.alphonsoPrimary)
                    .disabled(!state.canSave)
                    // The primary style does not dim itself, so show the disabled state here.
                    .opacity(state.canSave || state.isSubmitting ? 1 : 0.5)
                    .accessibilityLabel(state.isSubmitting ? "Saving" : NameOnboardingCopy.save)

                    Button(NameOnboardingCopy.skip) {
                        Task { await skip() }
                    }
                    .buttonStyle(.alphonsoSecondary)
                    .disabled(!state.canSkip)

                    Text(NameOnboardingCopy.skipNote(currentName: state.currentName))
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
                .padding(AlphonsoSpacing.lg)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .background(AlphonsoColor.surface)
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
