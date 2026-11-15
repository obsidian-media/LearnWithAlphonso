import SwiftUI
import LearnWithAlphonsoKit

/// The Help chat's network side. All the rules (what to show, merging, the pending message, limits) are the Kit's
/// `SupportChatState` and `SupportChatRules`; this only calls the three routes and feeds the answers in, like the web's
/// `useHelpChat`. The learner id is the session's: a request carries only the text and a client id.
@MainActor
@Observable
final class HelpChatModel {
    private(set) var state = SupportChatState()
    var draft = ""

    private let session: Session

    init(session: Session) {
        self.session = session
    }

    /// A client with a fresh token, or nil when signed out (the screen shows the load error).
    private func client() async -> SupportClient? {
        guard let token = await session.freshAccessToken() else { return nil }
        let session = self.session
        return SupportClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { token },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) }
        )
    }

    func load() async {
        state.loadStarted()
        guard let client = await client() else {
            state.loadFailed()
            return
        }
        do {
            state.loaded(try await client.fetchConversation())
        } catch {
            if Task.isCancelled { return }
            state.loadFailed()
        }
    }

    /// Quiet: a failed poll changes nothing and is tried again at the next tick.
    func poll() async {
        guard state.load == .ready, state.pending?.state != .sending,
              SupportChatRules.shouldPoll(status: state.status),
              let client = await client() else { return }
        if let conversation = try? await client.fetchConversation() {
            state.polled(conversation)
        }
    }

    /// Sends the draft. The text is kept (as the pending message) until the server confirms it, so a failure never
    /// loses what the learner wrote.
    func send(online: Bool, composerDisabled: Bool) {
        guard let text = SupportChatRules.sendableText(draft),
              state.canSend(online: online, composerDisabled: composerDisabled) else { return }
        draft = ""
        let pending = SupportPending(
            clientID: UUID().uuidString.lowercased(),
            text: text,
            baseID: state.newestID,
            at: ISO8601DateFormatter().string(from: Date())
        )
        Task { await attempt(pending) }
    }

    /// Same text, same client id: the server returns the stored message instead of posting twice.
    func retry() {
        guard let pending = state.retryable else { return }
        Task { await attempt(pending) }
    }

    private func attempt(_ pending: SupportPending) async {
        state.sendStarted(pending)
        guard let client = await client() else {
            state.sendFailed(pending, kind: .failed)
            return
        }
        do {
            state.sendSucceeded(try await client.sendMessage(text: pending.text, clientID: pending.clientID))
        } catch {
            state.sendFailed(pending, kind: (error as? SupportErrorKind) ?? .failed)
        }
    }

    func talkToPerson(online: Bool) async {
        guard !state.handoffBusy, online else { return }
        state.handoffStarted()
        guard let client = await client() else {
            state.handoffFailedNow()
            return
        }
        do {
            state.handoffSucceeded(try await client.requestHandoff())
        } catch {
            state.handoffFailedNow()
        }
    }
}
