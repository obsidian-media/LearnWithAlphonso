import SwiftUI
import WidgetKit
import LearnWithAlphonsoKit

struct StreakWidgetView: View {
    let entry: StreakEntry

    var body: some View {
        Group {
            if let snapshot = entry.snapshot {
                content(for: snapshot)
            } else {
                emptyState
            }
        }
        .padding()
        // Required since iOS 17 (the app's own deploymentTarget) --
        // WidgetKit deprecated a plain view background in favor of this,
        // and an iOS-17-only widget must use it, not the older modifier.
        .containerBackground(for: .widget) {
            Color(.systemBackground)
        }
    }

    private func content(for snapshot: StreakWidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\u{1F525}")
                    .font(.title2)
                Text("\(snapshot.streak)")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
            }
            Text(snapshot.streak == 1 ? "day streak" : "day streak")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            Label(
                snapshot.studiedToday ? "Studied today" : "Not studied yet",
                systemImage: snapshot.studiedToday ? "checkmark.circle.fill" : "circle"
            )
            .font(.caption2)
            .foregroundStyle(snapshot.studiedToday ? .green : .secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var emptyState: some View {
        VStack(spacing: 4) {
            Text("\u{1F525}")
                .font(.title)
            Text("Open Learn with Alphonso to start your streak")
                .font(.caption2)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
    }
}
