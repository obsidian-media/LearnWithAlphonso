import SwiftUI
import LearnWithAlphonsoKit

/// Shown when a lesson can't start at 0 hearts, matching the web's HeartsModal. A live countdown to the refill,
/// "Use 50 XP for a heart" through the same buy_heart_with_xp RPC as the web, and "Practice or review instead",
/// because review and practice never cost hearts. Every path leads somewhere.
struct OutOfHeartsSheet: View {
    let model: OutOfHeartsModel
    let course: Course
    let session: Session
    let isOnline: Bool
    let onUnblocked: () -> Void
    let onPracticeInstead: () -> Void

    @State private var buying = false
    @State private var buyMessage: String?
    @State private var refillHandled = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(spacing: AlphonsoSpacing.md) {
                Image(systemName: "heart.slash.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .accessibilityHidden(true)
                Text(OutOfHeartsModel.title)
                    .font(AlphonsoFont.display(21, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)
                Text(model.message(now: context.date))
                    .font(AlphonsoFont.sans(15))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.updatesFrequently)
                if model.showsBuy(isOnline: isOnline) {
                    Button {
                        Task { await buy() }
                    } label: {
                        if buying { ProgressView() } else { Text(OutOfHeartsModel.buyTitle) }
                    }
                    .buttonStyle(.alphonsoPrimary)
                    .disabled(buying)
                }
                if let buyMessage {
                    Text(buyMessage)
                        .font(AlphonsoFont.sans(13, weight: .medium))
                        .foregroundStyle(AlphonsoColor.destructive)
                        .multilineTextAlignment(.center)
                }
                Button(OutOfHeartsModel.practiceInsteadTitle, action: onPracticeInstead)
                    .buttonStyle(.alphonsoSecondary)
            }
            .padding()
            .onChange(of: model.isRefillDue(now: context.date)) { _, due in
                if due && !refillHandled {
                    refillHandled = true
                    Task { await refill() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .background(AlphonsoColor.surface)
    }

    private func client() async -> ProgressSyncClient? {
        guard let token = await session.freshAccessToken() else { return nil }
        return ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
    }

    private func buy() async {
        buying = true
        buyMessage = nil
        defer { buying = false }
        guard let client = await client() else {
            buyMessage = Copy.connectionFailure
            return
        }
        do {
            let result = try await client.buyHeartWithXp(course: course.wireCode)
            if let failure = OutOfHeartsModel.buyFailureMessage(result) { buyMessage = failure } else { onUnblocked() }
        } catch {
            buyMessage = Copy.connectionFailure
        }
    }

    /// The countdown reached zero: resolve the refill on the server (same RPC the web calls), then re-check.
    private func refill() async {
        if let client = await client() { _ = try? await client.restoreHeartsIfDue() }
        onUnblocked()
    }
}
