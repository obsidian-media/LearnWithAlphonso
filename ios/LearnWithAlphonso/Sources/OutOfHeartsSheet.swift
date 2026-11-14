import SwiftUI
import LearnWithAlphonsoKit

/// Shown when a lesson can't start at 0 hearts, matching the web's HeartsModal. A live countdown to the refill,
/// "Use 50 XP for a heart" through the same buy_heart_with_xp RPC as the web, and "Review instead",
/// because review and practice never cost hearts. Every path leads somewhere.
///
/// Drawn in the round-6 design system: a calm Alphonso, the 3D heart, the countdown in the heart colour.
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

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            ScrollView {
                VStack(spacing: AlphonsoDS.Space.s3) {
                    Image("Alphonso-hearts-calm")
                        .resizable()
                        .scaledToFit()
                        .frame(height: AlphonsoDS.Space.s12 * 3)
                        .accessibilityHidden(true)
                    Text(OutOfHeartsModel.title)
                        .dsText(.display)
                        .foregroundStyle(ds.brand)
                        .accessibilityAddTraits(.isHeader)
                    messageText(now: context.date)
                        .dsText(.body)
                        .foregroundStyle(ds.inkSoft)
                        .multilineTextAlignment(.center)
                        .accessibilityAddTraits(.updatesFrequently)
                    HStack(spacing: AlphonsoDS.Space.s2) {
                        Icon3DView(emoji: "\u{2764}\u{FE0F}", size: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s1)
                        Text("0").dsText(.numeralXL).foregroundStyle(ds.heart)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("0 hearts")
                    if model.showsBuy(isOnline: isOnline) {
                        Button {
                            Task { await buy() }
                        } label: {
                            if buying { ProgressView() } else { Text(OutOfHeartsModel.buyTitle) }
                        }
                        .buttonStyle(.dsButton(.primary))
                        .disabled(buying)
                    }
                    if let buyMessage {
                        Text(buyMessage)
                            .dsText(.caption)
                            .foregroundStyle(ds.wrongInk)
                            .multilineTextAlignment(.center)
                    }
                    Button(OutOfHeartsModel.practiceInsteadTitle, action: onPracticeInstead)
                        .buttonStyle(.dsButton(.secondary))
                }
                .padding(AlphonsoDS.Space.gutter)
            }
            .onChange(of: model.isRefillDue(now: context.date), initial: true) { _, due in
                if due && !refillHandled {
                    refillHandled = true
                    Task { await refill() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .background(ds.surface)
    }

    /// The model's sentence, with the countdown in the heart colour so it reads at a glance.
    private func messageText(now: Date) -> Text {
        let message = model.message(now: now)
        guard let countdown = model.countdown(now: now), let range = message.range(of: countdown) else {
            return Text(message)
        }
        let before = String(message[..<range.lowerBound])
        let after = String(message[range.upperBound...])
        return Text("\(before)\(Text(countdown).fontWeight(.bold).foregroundStyle(ds.heartText))\(after)")
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
