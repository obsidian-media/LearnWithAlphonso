import SwiftUI
import LearnWithAlphonsoKit

/// Learn screen row: streak freezes owned, XP balance, and "Buy a freeze". Same RPC as web and Android
/// (`buy_streak_freeze_with_xp`); the numbers and copy live in the Kit's StreakFreezeShop. The cached progress is
/// only updated after the server confirms the purchase, never optimistically.
struct StreakFreezeRow: View {
    let progress: LessonCompletionProgress
    let course: Course
    let session: Session
    let isOnline: Bool
    /// Called with the server-confirmed progress so the caller can cache it.
    let onBought: (LessonCompletionProgress) -> Void

    @State private var buying = false
    @State private var notice: String?
    @State private var confirmed: LessonCompletionProgress?

    private var shown: LessonCompletionProgress { confirmed ?? progress }
    private var disabledReason: String? {
        StreakFreezeShop.disabledReason(isOnline: isOnline, xp: shown.xp, buying: buying)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
            // Wraps under large Dynamic Type instead of truncating.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: AlphonsoSpacing.sm) { summary; Spacer(minLength: 0); buyButton }
                VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) { summary; buyButton }
            }
            if let reason = disabledReason, !buying {
                Text(reason)
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let notice {
                Text(notice)
                    .font(AlphonsoFont.sans(13, weight: .medium))
                    .foregroundStyle(AlphonsoColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .padding(.horizontal, AlphonsoSpacing.md)
        .padding(.vertical, AlphonsoSpacing.sm)
        .onChange(of: progress) { _, _ in confirmed = nil }
    }

    private var summary: some View {
        Label {
            Text("\(StreakFreezeShop.ownedText(shown.streakFreezes)) \u{00B7} \(shown.xp) XP")
                .font(AlphonsoFont.sans(14, weight: .medium))
                .foregroundStyle(AlphonsoColor.ink)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "snowflake").foregroundStyle(AlphonsoColor.moss)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(StreakFreezeShop.accessibilityLabel(freezes: shown.streakFreezes, xp: shown.xp))
    }

    private var buyButton: some View {
        Button {
            Task { await buy() }
        } label: {
            if buying { ProgressView() } else { Text(StreakFreezeShop.buyTitle).fixedSize(horizontal: false, vertical: true) }
        }
        .buttonStyle(.alphonsoSecondary)
        .disabled(disabledReason != nil)
        .accessibilityHint(disabledReason ?? "Spends \(StreakFreezeShop.xpCost) XP")
    }

    private func buy() async {
        buying = true
        notice = nil
        defer { buying = false }
        guard let token = await session.freshAccessToken() else {
            notice = Copy.connectionFailure
            return
        }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
        do {
            let result = try await client.buyStreakFreezeWithXp(course: course.wireCode)
            notice = StreakFreezeShop.message(for: result)
            if StreakFreezeShop.isSuccess(result) {
                let updated = StreakFreezeShop.progress(after: result, from: shown)
                confirmed = updated
                onBought(updated)
            }
            UIAccessibility.post(notification: .announcement, argument: notice)
        } catch {
            notice = Copy.connectionFailure
        }
    }
}
