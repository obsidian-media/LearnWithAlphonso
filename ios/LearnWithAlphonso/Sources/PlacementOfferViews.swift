import SwiftUI
import LearnWithAlphonsoKit

/// What the placement offer needs that the app has to fetch. The rule itself is `PlacementOffer` in the Kit.
@MainActor
enum PlacementOfferLoader {
    /// The level the learner chose in the first run, or nil when it cannot be read.
    static func firstRunLevel(session: Session) async -> String? {
        (try? await learnerProfileClient(session)?.fetch())?.answers.level
    }

    /// Whether placement was taken for the course. True when it cannot be told (offline, signed out): no offer then.
    static func placementTaken(session: Session, courseCode: String) async -> Bool {
        guard let accessToken = await session.freshAccessToken() else { return true }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            return try await client.fetchPlacementTakenAt(course: courseCode) != nil
        } catch {
            return true
        }
    }

    static func isDismissed(courseCode: String) -> Bool {
        UserDefaults.standard.bool(forKey: PlacementOffer.dismissKey(course: courseCode))
    }

    static func dismiss(courseCode: String) {
        UserDefaults.standard.set(true, forKey: PlacementOffer.dismissKey(course: courseCode))
    }
}

/// The invitation: "Find your level" with Start and Not now. Used on the Hector call-ended screen and at the top of
/// Learn; it is a card in the existing styling, not a screen.
struct PlacementOfferCard: View {
    @Environment(\.alphonsoDS) private var ds
    let onStart: () -> Void
    let onNotNow: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            Text(PlacementOffer.title).dsText(.headline).foregroundStyle(ds.ink)
            Text(PlacementOffer.body).dsText(.footnote).foregroundStyle(ds.inkSoft)
            HStack(spacing: AlphonsoDS.Space.s2) {
                Button(PlacementOffer.start, action: onStart)
                    .buttonStyle(.dsButton(.primary, compact: true, fullWidth: false))
                    .accessibilityIdentifier("placementOfferStart")
                Button(PlacementOffer.notNow, action: onNotNow)
                    .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                    .accessibilityIdentifier("placementOfferNotNow")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(AlphonsoDS.Space.s4)
        .background(
            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card.opacity(0.94)))
        .dsElevation(AlphonsoDS.Elevation.resting, line: ds.brand)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("placementOfferCard")
    }
}
