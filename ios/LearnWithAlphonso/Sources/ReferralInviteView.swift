import SwiftUI
import UIKit
import LearnWithAlphonsoKit

/// Profile > Social > "Invite friends": the learner's referral link with a native share sheet and a copy button, how many
/// friends joined, the reward in plain words, and the "monthly invite reward limit reached" state. Mirrors the web's
/// /profile/invite (src/routes/_authenticated/profile_.invite.tsx) and the Android ReferralInviteScreen.
///
/// The app only DISPLAYS and CLAIMS. Whether anything is granted is decided on the server after the friend's first
/// completed lesson; nothing here can ask for a reward.
///
/// A new learner who got a code but whose link did not open the app can type or paste it in "Got an invite code?" (the
/// manual fallback while `/?ref=` is not an app link; see ReferralLink).
struct ReferralInviteView: View {
    let session: Session

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dismiss) private var dismiss

    @State private var isLoading = true
    @State private var link: String?
    @State private var summary: ReferralSummary?
    @State private var copied = false
    @State private var entry = ""
    @State private var entryMessage: String?
    @State private var entryDone = false
    @State private var isClaiming = false

    var body: some View {
        NavigationStack {
            List {
                DSGlassTitle(title: ReferralCopy.title)
                    .dsListRow(top: AlphonsoDS.Space.s2)
                explainerCard.dsListRow()
                linkCard.dsListRow()
                if let summary {
                    countCard(summary).dsListRow()
                }
                enterCard.dsListRow()
            }
            .dsSceneList(.practice)
            .navigationTitle(ReferralCopy.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }.tint(ds.choice)
                }
            }
            // On the container, which always draws, never on a branch that can draw nothing.
            .task { await load() }
        }
        .tint(ds.choice)
    }

    private var explainerCard: some View {
        DSCard {
            HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                Icon3DView(emoji: "\u{1F91D}", size: AlphonsoDS.Space.s12)
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                    Text("Both of you get a reward").dsText(.headline).foregroundStyle(ds.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(ReferralCopy.explainer).dsText(.footnote).foregroundStyle(ds.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Text(ReferralCopy.proNote).dsText(.caption).foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var linkCard: some View {
        DSCard {
            DSOverline("Your link")
            if isLoading {
                ProgressView().tint(ds.choice).frame(maxWidth: .infinity)
            } else if let link {
                Text(link).dsText(.footnote).foregroundStyle(ds.ink)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("referralLink")
                Button(copied ? ReferralCopy.copied : ReferralCopy.copy) { copy(link) }
                    .buttonStyle(.dsButton(.primary))
                ShareLink(
                    item: link,
                    subject: Text(ReferralCopy.title),
                    message: Text(ReferralCopy.shareText)
                ) {
                    Label(ReferralCopy.share, systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.dsButton(.secondary))
            } else {
                Text(ReferralCopy.loadError).dsText(.footnote).foregroundStyle(ds.inkSoft)
                Button("Try again") { Task { await load() } }
                    .buttonStyle(.dsButton(.secondary))
            }
        }
    }

    private func countCard(_ summary: ReferralSummary) -> some View {
        DSCard {
            DSOverline("Your invites")
            Text("\(summary.completed)").dsText(.title).foregroundStyle(ds.ink)
                .accessibilityIdentifier("referralCount")
            Text(summary.countLine).dsText(.footnote).foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            if summary.capReached {
                Text(ReferralCopy.capReached).dsText(.footnote).foregroundStyle(ds.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("referralCapReached")
            } else {
                Text(summary.rewardsLeftLine).dsText(.caption).foregroundStyle(ds.inkSoft)
            }
        }
    }

    /// The manual fallback: type or paste the code from a friend's link. Only a new account's claim is accepted; the
    /// server answers why when it is not.
    private var enterCard: some View {
        DSCard {
            Text(ReferralCopy.enterTitle).dsText(.headline).foregroundStyle(ds.ink)
                .accessibilityAddTraits(.isHeader)
            Text(ReferralCopy.enterHint).dsText(.footnote).foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: AlphonsoDS.Space.s3) {
                TextField(ReferralCopy.enterField, text: $entry)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .onSubmit { Task { await claimEntry() } }
                    .dsField()
                Button(ReferralCopy.enterButton) { Task { await claimEntry() } }
                    .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                    .disabled(ReferralLink.code(fromEntry: entry) == nil || isClaiming)
            }
            if let entryMessage {
                Text(entryMessage).dsText(.footnote)
                    .foregroundStyle(entryDone ? ds.ink : ds.wrongInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("referralEntryMessage")
            }
        }
    }

    private func makeClient() async -> ProgressSyncClient? {
        guard let token = await session.freshAccessToken() else { return nil }
        return ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        guard let client = await makeClient() else { link = nil; return }
        // The learner's own invite code (shared with the friend invite); a failed read says "unknown", never a made-up link.
        if let code = try? await client.getMyFriendCode() {
            link = ReferralLink.link(base: AppConfig.apiBaseURL, code: code)
        } else {
            link = nil
        }
        // A failed read says "unknown" (no card), never a made-up zero.
        if let userID = session.userID, let rows = try? await client.fetchReferralRows(referrerID: userID) {
            summary = ReferralSummary.summarize(rows)
        } else {
            summary = nil
        }
    }

    private func copy(_ link: String) {
        UIPasteboard.general.string = link
        copied = true
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            copied = false
        }
    }

    private func claimEntry() async {
        guard !isClaiming else { return }
        isClaiming = true
        defer { isClaiming = false }
        let store = UserDefaultsReferralStore()
        let client = await makeClient()
        let result = await ReferralPending.claimManual(entry, store: store) { code in
            guard let client else { return .error }
            return await client.claimReferral(code: code)
        }
        switch result {
        case .claimed:
            entryDone = true
            entryMessage = ReferralCopy.enterDone
            entry = ""
        case .refused(let reason):
            entryDone = false
            entryMessage = ReferralCopy.refusal(reason)
        case .error:
            entryDone = false
            entryMessage = ReferralCopy.claimError
        }
    }
}

/// Once the learner is signed in, sends a captured referral code to the server exactly once (the code is cleared on every
/// final answer; only an unexplained error keeps it for the next launch). The server decides: only a new account, only
/// once, never yourself. Silent: a refusal is not an error worth a screen.
enum ReferralAutoClaim {
    @MainActor
    static func run(session: Session) async {
        let store = UserDefaultsReferralStore()
        // Nothing captured: no token refresh, no request.
        guard session.userID != nil, ReferralPending.read(store: store) != nil else { return }
        guard let token = await session.freshAccessToken() else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
        _ = await ReferralPending.claimPending(store: store) { await client.claimReferral(code: $0) }
    }
}
