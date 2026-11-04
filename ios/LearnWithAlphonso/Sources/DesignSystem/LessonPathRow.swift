import SwiftUI

/// One lesson in the Learn screen's unit list: a chunky tile with a status medallion on the left.
/// Done is a moss medallion with a check; next is ember with a play mark, and the whole tile gets an ember border;
/// any other lesson shows its number. The tile has the app's 4 pt bottom edge.
struct LessonPathRow: View {
    enum Status {
        case done, next, open
    }

    let number: Int
    let title: String
    let subtitle: String
    let status: Status

    private var border: Color {
        status == .next ? AlphonsoColor.ember : AlphonsoColor.hairline
    }

    var body: some View {
        HStack(spacing: AlphonsoSpacing.sm + 4) {
            medallion
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AlphonsoFont.display(17, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)
                Text(subtitle)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, AlphonsoSpacing.md)
        .padding(.vertical, AlphonsoSpacing.sm + 2)
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(border, lineWidth: 2)
        )
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(border)
                .offset(y: 4)
        )
        .padding(.bottom, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Lesson \(number), \(title)\(statusWord)")
        .accessibilityHint(subtitle)
    }

    private var statusWord: String {
        switch status {
        case .done: return ", done"
        case .next: return ", up next"
        case .open: return ""
        }
    }

    @ViewBuilder
    private var medallion: some View {
        ZStack {
            switch status {
            case .done:
                Circle().fill(AlphonsoColor.moss)
                Image(systemName: "checkmark")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(AlphonsoColor.surface)
            case .next:
                Circle().fill(AlphonsoColor.ember)
                Image(systemName: "play.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(AlphonsoColor.onAccent)
            case .open:
                Circle().fill(AlphonsoColor.surface)
                Circle().strokeBorder(AlphonsoColor.hairline, lineWidth: 2)
                Text("\(number)")
                    .font(AlphonsoFont.display(17, weight: .bold))
                    .foregroundStyle(AlphonsoColor.ink)
            }
        }
        .frame(width: 44, height: 44)
        .accessibilityHidden(true)
    }
}
