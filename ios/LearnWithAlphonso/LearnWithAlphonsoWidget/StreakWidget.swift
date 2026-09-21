import WidgetKit
import SwiftUI
import LearnWithAlphonsoKit

struct StreakWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetSharing.streakWidgetKind, provider: StreakTimelineProvider()) { entry in
            StreakWidgetView(entry: entry)
        }
        .configurationDisplayName("Streak")
        .description("See your current learning streak at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
