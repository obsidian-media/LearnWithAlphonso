import SwiftUI
import LearnWithAlphonsoKit

/// The two things "Explain in my language" needs from the learner's profile: their own language and the mode. Read
/// once per account from /api/learner-profile and shared by every screen that offers an explanation, so the Settings
/// choice shows everywhere at once. Nothing is shown until a read has landed (a failed read leaves it hidden).
@MainActor
final class ExplainSettingsStore: ObservableObject {
    static let shared = ExplainSettingsStore()

    @Published private(set) var nativeLanguage: String?
    @Published private(set) var mode: ExplainMode = .default
    @Published private(set) var isLoaded = false

    private var loadedFor: String?
    private var isLoading = false

    /// Reads the profile when this account's has not been read yet. Safe to call from every screen.
    func load(session: Session) async {
        guard let userID = session.userID else {
            reset()
            return
        }
        if loadedFor == userID && isLoaded { return }
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        if loadedFor != userID { reset() }
        guard let client = await learnerProfileClient(session),
              let profile = try? await client.fetch() else { return }
        guard session.userID == userID else { return }
        apply(profile.answers)
        loadedFor = userID
        isLoaded = true
    }

    /// Saves the mode on the account; the screens follow at once, and a failed save puts the old one back.
    func setMode(_ newMode: ExplainMode, session: Session) async -> Bool {
        let previous = mode
        mode = newMode
        guard let client = await learnerProfileClient(session),
              let profile = try? await client.save(LearnerAnswers(explainMode: newMode)) else {
            mode = previous
            return false
        }
        apply(profile.answers)
        return true
    }

    /// Saves the learner's own language (the same field first run sets).
    func setNativeLanguage(_ code: String, session: Session) async -> Bool {
        let previous = nativeLanguage
        nativeLanguage = code
        guard let client = await learnerProfileClient(session),
              let profile = try? await client.save(LearnerAnswers(nativeLanguage: code)) else {
            nativeLanguage = previous
            return false
        }
        apply(profile.answers)
        return true
    }

    private func apply(_ answers: LearnerAnswers) {
        nativeLanguage = answers.nativeLanguage
        mode = answers.effectiveExplainMode
    }

    private func reset() {
        nativeLanguage = nil
        mode = .default
        isLoaded = false
        loadedFor = nil
    }
}
