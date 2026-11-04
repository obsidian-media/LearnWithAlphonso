import SwiftUI
import LearnWithAlphonsoKit

/// Learn screen row: streak freezes owned, the ACTIVE course's XP, and "Buy a freeze". Same RPC as web and Android
/// (`buy_streak_freeze_with_xp`, charged to one course); the numbers and copy live in the Kit's StreakFreezeShop.
///
/// The XP shown and checked is read for `course` (`fetchStreakFreezeStatus`), not taken from the header cache, which
/// holds whichever course was updated last. The cache is only given the freeze count after the server confirms.
struct StreakFreezeRow: View {
    /// The account-wide freeze count from the cache, shown until the server status loads.
    let cachedFreezes: Int
    let course: Course
    let session: Session
    let isOnline: Bool
    /// Called with the server-confirmed freeze count so the caller can cache it.
    let onFreezesChanged: (Int) -> Void

    @State private var buying = false
    @State private var notice: String?
    @State private var status: StreakFreezeStatus?

    private var freezes: Int { status?.streakFreezes ?? cachedFreezes }
    private var disabledReason: String? {
        StreakFreezeShop.disabledReason(isOnline: isOnline, xp: status?.xp, buying: buying)
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
            }
        }
        .padding(.horizontal, AlphonsoSpacing.md)
        .padding(.vertical, AlphonsoSpacing.sm)
        // Another course has another balance: forget the old one at once, then read the new one.
        .task(id: "\(course.wireCode)-\(isOnline)") {
            status = nil
            notice = nil
            guard isOnline, let client = await client() else { return }
            if let loaded = try? await client.fetchStreakFreezeStatus(course: course.wireCode) {
                status = loaded
                if loaded.streakFreezes != cachedFreezes { onFreezesChanged(loaded.streakFreezes) }
            }
        }
    }

    private var summary: some View {
        let text = status.map { "\(StreakFreezeShop.ownedText($0.streakFreezes)) \u{00B7} \($0.xp) XP" }
            ?? StreakFreezeShop.ownedText(freezes)
        return Label {
            Text(text)
                .font(AlphonsoFont.sans(14, weight: .medium))
                .foregroundStyle(AlphonsoColor.ink)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "snowflake").foregroundStyle(AlphonsoColor.moss)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(StreakFreezeShop.accessibilityLabel(freezes: freezes, xp: status?.xp))
    }

    private var buyButton: some View {
        Button {
            // Set before the Task starts: two quick taps would otherwise both pass the check and charge twice.
            guard !buying else { return }
            buying = true
            Task { await buy() }
        } label: {
            if buying { ProgressView() } else { Text(StreakFreezeShop.buyTitle).fixedSize(horizontal: false, vertical: true) }
        }
        .buttonStyle(.alphonsoSecondary)
        .disabled(disabledReason != nil)
        .accessibilityHint(disabledReason ?? "Spends \(StreakFreezeShop.xpCost) XP")
    }

    private func client() async -> ProgressSyncClient? {
        guard let token = await session.freshAccessToken() else { return nil }
        return ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
    }

    /// Shows a message and says it aloud: every path ends with one VoiceOver announcement.
    private func say(_ message: String) {
        notice = message
        UIAccessibility.post(notification: .announcement, argument: message)
    }

    private func buy() async {
        notice = nil
        defer { buying = false }
        guard let client = await client() else {
            say(Copy.connectionFailure)
            return
        }
        let before = freezes
        do {
            let result = try await client.buyStreakFreezeWithXp(course: course.wireCode)
            if let current = status { status = StreakFreezeShop.status(after: result, from: current) }
            if StreakFreezeShop.isSuccess(result), let confirmed = status { onFreezesChanged(confirmed.streakFreezes) }
            say(StreakFreezeShop.message(for: result))
        } catch {
            // No answer: the purchase may still have committed. Re-read the server rather than invite a second tap.
            let reread = try? await client.fetchStreakFreezeStatus(course: course.wireCode)
            if let reread {
                status = reread
                onFreezesChanged(reread.streakFreezes)
            }
            say(StreakFreezeShop.recoveryMessage(before: before, after: reread))
        }
    }
}
