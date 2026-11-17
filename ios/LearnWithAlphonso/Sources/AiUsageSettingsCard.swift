import SwiftUI
import LearnWithAlphonsoKit

/// Settings > "AI practice this month": the learner's use of the monthly AI limit as a meter and a word, never a price.
/// Mirrors the web's AiUsageSetting. It only draws what `AiUsage.parse` accepted; the parent shows nothing at all when
/// the read failed or the state is unknown, so this view never has an empty or "error" shape.
struct AiUsageSettingsCard: View {
    let usage: AiUsageView
    @Environment(\.alphonsoDS) private var ds

    private var tint: Color {
        switch usage.state {
        case .ok: return ds.choice
        case .warn: return ds.xp
        case .capped: return ds.flame
        }
    }

    var body: some View {
        DSCard {
            HStack(alignment: .firstTextBaseline, spacing: AlphonsoDS.Space.s3) {
                Text(AiUsageCopy.title).dsText(.headline).foregroundStyle(ds.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: AlphonsoDS.Space.s2)
                Text(usage.label).dsText(.caption).foregroundStyle(ds.ink)
            }
            // The state word sits beside the meter, so colour is never the only signal.
            DSProgressBar(
                fraction: Double(usage.percent) / 100, tint: tint,
                accessibilityLabel: AiUsageCopy.title, accessibilityValue: usage.valueText)
            Text(usage.summary).dsText(.footnote).foregroundStyle(ds.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(AiUsageCopy.explain).dsText(.footnote).foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier("aiUsageCard")
    }
}
