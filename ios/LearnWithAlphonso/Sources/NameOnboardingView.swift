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

                    TextField(NameOnboardingCopy.fieldLabel, text: Binding(
                        get: { state.name },
                        set: { state.edit($0) }
                    ))
                    .textFieldStyle(.plain)
                    .padding(AlphonsoSpacing.sm + 2)
                    .alphonsoInputBackground()
                    .textContentType(.nickname)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .focused($fieldFocused)
                    .submitLabel(.done)
                    .onSubmit { Task { await save() } }
                    .accessibilityLabel(NameOnboardingCopy.fieldLabel)

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
            .scrollDismissesKeyboard(.interactively)
        }
        .interactiveDismissDisabled()
        .onAppear { fieldFocused = true }
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

    private func skip() async {
        guard state.canSkip, state.beginSubmit() else { return }
        guard let client = await makeClient() else {
            state.submitFailed(ProgressSyncError.server(status: 401, message: "unauthenticated"))
            return
        }
        do {
            _ = try await client.skipDisplayNamePrompt()
            state.submitSucceeded()
            onFinish()
        } catch {
            state.submitFailed(error)
        }
    }
}
