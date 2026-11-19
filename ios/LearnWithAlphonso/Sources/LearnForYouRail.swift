import SwiftUI
import LearnWithAlphonsoKit

/// Learn's "For you" rail: Review, the goal path, the team mission and this week's challenges as one row of small
/// cards. Each card keeps what it always did: Review opens the review queue, the path card opens the planner (no goal
/// yet) or its detail below the rail, and the team mission and challenges open their full card below the rail. The
/// host owns the data and the state; this view only draws the row and reports taps.
struct LearnForYouRail: View {
    /// One card in the rail.
    struct Item: Identifiable {
        let id: String
        let emoji: String
        let title: String
        let value: String
        /// What VoiceOver reads: the title and its value in one phrase.
        let spoken: String
        /// A red dot for something waiting (Review with items due).
        var showsDot = false
        /// nil for a card that opens a screen; true or false for one that opens its detail in place.
        var expanded: Bool?
        let action: () -> Void
    }

    let items: [Item]
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            Text("For you")
                .dsText(.headline)
                .foregroundStyle(ds.ink)
                .accessibilityAddTraits(.isHeader)
                .padding(.horizontal, AlphonsoDS.Space.gutter)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: AlphonsoDS.Space.s2) {
                    ForEach(items) { item in
                        card(item)
                    }
                }
                .padding(.horizontal, AlphonsoDS.Space.gutter)
            }
        }
        .padding(.vertical, AlphonsoDS.Space.s2)
    }

    private func card(_ item: Item) -> some View {
        Button(action: item.action) {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                Icon3DView(emoji: item.emoji, size: AlphonsoDS.Space.s8)
                    .accessibilityHidden(true)
                Text(item.title)
                    .dsText(.footnote)
                    .foregroundStyle(ds.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(item.value)
                    .dsText(.caption)
                    .foregroundStyle(ds.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(AlphonsoDS.Space.s3)
            .frame(width: 124, alignment: .leading)
            .frame(minHeight: AlphonsoDS.Space.minTouch, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card.opacity(0.94)))
            .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
            .overlay(alignment: .topTrailing) {
                if item.showsDot {
                    Circle()
                        .fill(ds.heart)
                        .frame(width: 8, height: 8)
                        .padding(AlphonsoDS.Space.s2)
                        .accessibilityHidden(true)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.spoken)
        .accessibilityValue(item.expanded.map { $0 ? "Expanded" : "Collapsed" } ?? "")
        .accessibilityAddTraits(.isButton)
    }
}
