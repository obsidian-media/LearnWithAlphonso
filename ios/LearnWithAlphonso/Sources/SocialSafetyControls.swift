import SwiftUI
import LearnWithAlphonsoKit

/// Block and report -- App Store Guideline 1.2: an app with user
/// interaction (friends, nudges, duels, open matchmaking, leaderboards,
/// display names -- everything FriendsView/DuelsView/LeaderboardView
/// expose) needs a way to block an abusive user and report content.
/// Backend enforcement (RLS, block_user RPC, and every read/write path a
/// block should close) lives in supabase/migrations/
/// 20260928020000_block_and_report.sql; this file is the UI shared by
/// all three surfaces, since the report flow itself is genuinely
/// identical everywhere it appears -- unlike this codebase's usual
/// per-screen-duplication preference (see HectorTurnRecorder's own doc
/// comment), duplicating a whole form three times would just be drift
/// waiting to happen.

/// A minimal user reference for the block/report actions -- each surface
/// resolves its own id/displayName from whatever row shape it already
/// has (`FriendProgress`, a `Duel`'s opponent id, a `LeaderboardRow`).
struct SocialTarget: Identifiable, Equatable {
    let id: String
    let displayName: String
}

/// Sent as `content_reports.reason` verbatim -- short, stable snake_case
/// tokens rather than the display label, since content_reports has no
/// client read path at all (service_role only); a future moderation tool
/// reading this column directly will want stable values, not prose.
enum ReportReason: String, CaseIterable, Identifiable {
    case spam
    case harassment
    case inappropriateContent = "inappropriate_content"
    case fakeAccount = "fake_account"
    case other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .spam: return "Spam"
        case .harassment: return "Harassment or bullying"
        case .inappropriateContent: return "Inappropriate content"
        case .fakeAccount: return "Fake account"
        case .other: return "Something else"
        }
    }
}

/// Presented via `.sheet(item:)` from FriendsView/DuelsView/
/// LeaderboardView. Posts straight to `content_reports`
/// (ProgressSyncClient.reportUser) -- there is deliberately no read-back
/// afterwards anywhere in this app, matching the table's own RLS (no
/// SELECT policy for anyone but service_role).
struct ReportSheet: View {
    let target: SocialTarget
    let session: Session

    @Environment(\.dismiss) private var dismiss
    @State private var selectedReason: ReportReason = .spam
    @State private var isSubmitting = false
    @State private var didSubmit = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if didSubmit {
                    confirmationBody
                } else {
                    formBody
                }
            }
            .background(AlphonsoColor.surface)
            .navigationTitle("Report \(target.displayName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(didSubmit ? "Done" : "Cancel") { dismiss() }
                }
            }
        }
        .tint(AlphonsoColor.moss)
    }

    private var formBody: some View {
        List {
            Section {
                ForEach(ReportReason.allCases) { reason in
                    Button {
                        selectedReason = reason
                    } label: {
                        HStack {
                            Text(reason.label)
                                .font(AlphonsoFont.sans(15))
                                .foregroundStyle(AlphonsoColor.ink)
                            Spacer()
                            if selectedReason == reason {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(AlphonsoColor.moss)
                            }
                        }
                    }
                }
            } header: {
                Text("Why are you reporting this person?")
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .tracking(0.4)
                    .foregroundStyle(AlphonsoColor.ember)
            }
            .listRowBackground(AlphonsoColor.parchment)

            if let errorMessage {
                Text(errorMessage)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .listRowBackground(Color.clear)
            }

            Section {
                Button {
                    Task { await submit() }
                } label: {
                    if isSubmitting {
                        ProgressView().tint(AlphonsoColor.onAccent)
                    } else {
                        Text("Submit Report")
                    }
                }
                .buttonStyle(.alphonsoPrimary)
                .disabled(isSubmitting)
            }
            .listRowBackground(Color.clear)
        }
        .scrollContentBackground(.hidden)
    }

    private var confirmationBody: some View {
        VStack(spacing: AlphonsoSpacing.md) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 40))
                .foregroundStyle(AlphonsoColor.moss)
            Text("Report submitted")
                .font(AlphonsoFont.display(18, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            Text("Thanks for letting us know. Our team reviews every report. If you need to follow up, contact report@alphonsoecosystem.app.")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private func submit() async {
        guard let accessToken = session.accessToken else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            try await client.reportUser(target.id, reason: selectedReason.rawValue)
            didSubmit = true
        } catch {
            errorMessage = "Couldn't submit your report. Try again."
        }
    }
}

/// Small trailing "..." menu offering Block/Report for a row -- used by
/// FriendsView, DuelsView, and LeaderboardView identically. An explicit
/// visible button rather than a long-press `.contextMenu`, since a
/// hidden-until-long-pressed action is exactly the kind of thing an App
/// Store reviewer testing this requirement might not find.
struct SocialSafetyMenu: View {
    let onBlock: () -> Void
    let onReport: () -> Void

    var body: some View {
        Menu {
            Button(role: .destructive, action: onBlock) {
                Label("Block User", systemImage: "hand.raised.slash")
            }
            Button(action: onReport) {
                Label("Report User", systemImage: "flag")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .foregroundStyle(AlphonsoColor.inkSoft)
        }
    }
}

/// Shared block confirmation -- one line of copy every surface uses
/// verbatim, so the "does not delete/report anything, only blocks"
/// scope and the report@alphonsoecosystem.app contact stay consistent
/// wherever this is shown.
enum SocialSafetyCopy {
    static func blockConfirmationMessage(_ displayName: String) -> String {
        "\(displayName) won't be able to add you as a friend or challenge you to a duel, and you won't see them in friends, activity, or leaderboards. Contact report@alphonsoecosystem.app if you need help with this."
    }
}
