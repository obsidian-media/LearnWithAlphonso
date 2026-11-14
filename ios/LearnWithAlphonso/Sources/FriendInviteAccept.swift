import SwiftUI
import Observation
import LearnWithAlphonsoKit

/// A friend invite waiting to be shown: set when a Universal Link (https://learn.alphonsoecosystem.app/invite/{code})
/// opens the app, or when a pasted link or code is entered on the Friends screen. It survives being signed out, so the
/// learner signs in or up first and then sees the invite; RootView shows it once the learner is signed in and not in
/// the middle of onboarding.
@Observable
@MainActor
final class PendingInvite {
    var code: String?
}

private struct InviteItem: Identifiable {
    let code: String
    var id: String { code }
}

extension View {
    /// Presents the accept sheet for `pending` while `isReady` (signed in, no cover on screen).
    func friendInviteSheet(pending: PendingInvite, session: Session, isReady: Bool) -> some View {
        sheet(item: Binding<InviteItem?>(
            get: { isReady ? pending.code.map(InviteItem.init) : nil },
            set: { if $0 == nil { pending.code = nil } }
        )) { item in
            FriendInviteAcceptView(session: session, code: item.code) { pending.code = nil }
        }
    }
}

/// "Add {name} as a friend?" Mirrors the web's invite route: a preview first, then one explicit accept.
struct FriendInviteAcceptView: View {
    let session: Session
    let code: String
    let onClose: () -> Void

    private enum Phase: Equatable {
        case loading
        case ready(name: String)
        case accepted(name: String)
        case isSelf
        case invalid
        case failed(String)
    }

    @State private var phase = Phase.loading
    @State private var isAccepting = false

    var body: some View {
        NavigationStack {
            VStack(spacing: AlphonsoSpacing.md) {
                Spacer()
                content
                Spacer()
            }
            .padding(AlphonsoSpacing.lg)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(AlphonsoColor.surface.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close", action: onClose)
                }
            }
            // On the container, which always draws, never on a branch that can draw nothing.
            .task(id: code) { await loadPreview() }
        }
    }

    @ViewBuilder private var content: some View {
        switch phase {
        case .loading:
            ProgressView("Loading invite")
        case .ready(let name):
            title("Add \(name) as a friend?")
            note("You'll be able to see each other's streak and weekly progress.")
            Button {
                Task { await accept(name: name) }
            } label: {
                if isAccepting { ProgressView().tint(AlphonsoColor.surface) } else { Text("Add friend") }
            }
            .buttonStyle(.alphonsoPrimary)
            .disabled(isAccepting)
        case .accepted(let name):
            title("You're friends with \(name)!")
            Button("Done", action: onClose).buttonStyle(.alphonsoPrimary)
        case .isSelf:
            title("That's your own invite link")
            note("Share it with a friend instead.")
            Button("Close", action: onClose).buttonStyle(.alphonsoSecondary)
        case .invalid:
            title("Invite not found")
            note("This invite link doesn't look right. Ask your friend for a fresh one.")
            Button("Close", action: onClose).buttonStyle(.alphonsoSecondary)
        case .failed(let message):
            title("Something went wrong")
            note(message)
            Button("Try again") { Task { await loadPreview() } }.buttonStyle(.alphonsoSecondary)
        }
    }

    private func title(_ text: String) -> some View {
        Text(text)
            .font(.title2.weight(.semibold))
            .foregroundStyle(AlphonsoColor.ink)
            .multilineTextAlignment(.center)
            .accessibilityAddTraits(.isHeader)
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(AlphonsoColor.inkSoft)
            .multilineTextAlignment(.center)
    }

    private func client() -> ProgressSyncClient? {
        guard let token = session.accessToken else { return nil }
        return ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
    }

    private func loadPreview() async {
        phase = .loading
        guard let client = client() else {
            phase = .failed("Sign in to accept this invite.")
            return
        }
        do {
            let preview = try await client.getFriendInvitePreview(code: code)
            if preview.isSelf {
                phase = .isSelf
            } else if !preview.isFound {
                phase = .invalid
            } else {
                phase = .ready(name: preview.displayName ?? "this learner")
            }
        } catch {
            phase = .failed("Couldn't load this invite. Check your connection and try again.")
        }
    }

    private func accept(name: String) async {
        guard let client = client() else { return }
        isAccepting = true
        defer { isAccepting = false }
        do {
            let result = try await client.acceptFriendInvite(code: code)
            if result.ok {
                phase = .accepted(name: name)
            } else if result.message == "invalid-code" {
                phase = .invalid
            } else if result.message == "cannot invite yourself" {
                phase = .isSelf
            } else {
                phase = .failed("Couldn't add this friend (\(result.message)).")
            }
        } catch {
            phase = .failed("Couldn't add this friend. Check your connection and try again.")
        }
    }
}
