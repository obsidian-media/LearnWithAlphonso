import SwiftUI

// MARK: - Buttons

/// Primary CTA button style: moss fill, cream text, and the web app's
/// "hard shadow" pressed effect (`.hard-shadow` in `styles.css` --
/// a solid moss-deep drop shadow that collapses to nothing while the
/// button translates down as it's pressed, giving a tactile/game-like
/// press rather than the default system dimming).
struct AlphonsoPrimaryButtonStyle: ButtonStyle {
    var tint: Color = AlphonsoColor.moss
    var shadow: Color = AlphonsoColor.mossDeep
    /// false for inline/chip usage (e.g. a word-bank token) where the
    /// button should size to its label instead of filling its container.
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AlphonsoFont.sans(17, weight: .semiBold))
            .foregroundStyle(AlphonsoColor.surface)
            .padding(.vertical, AlphonsoSpacing.sm + 2)
            .padding(.horizontal, AlphonsoSpacing.lg)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(tint, in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
            .offset(y: configuration.isPressed ? 4 : 0)
            .background(
                RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                    .fill(shadow)
                    .offset(y: configuration.isPressed ? 0 : 4)
            )
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Secondary/outline button: parchment fill, hairline border, ink text --
/// no pressed shadow (reserved for primary CTAs, matching the web app's
/// use of `.hard-shadow` only on its main action buttons).
struct AlphonsoSecondaryButtonStyle: ButtonStyle {
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AlphonsoFont.sans(15, weight: .medium))
            .foregroundStyle(AlphonsoColor.ink)
            .padding(.vertical, AlphonsoSpacing.sm)
            .padding(.horizontal, AlphonsoSpacing.md)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: AlphonsoRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: AlphonsoRadius.md, style: .continuous)
                    .strokeBorder(AlphonsoColor.hairline, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

extension ButtonStyle where Self == AlphonsoPrimaryButtonStyle {
    static var alphonsoPrimary: AlphonsoPrimaryButtonStyle { AlphonsoPrimaryButtonStyle() }
    static var alphonsoEmber: AlphonsoPrimaryButtonStyle {
        AlphonsoPrimaryButtonStyle(tint: AlphonsoColor.ember, shadow: AlphonsoColor.ember.opacity(0.65))
    }
    static func alphonsoPrimary(fullWidth: Bool) -> AlphonsoPrimaryButtonStyle {
        AlphonsoPrimaryButtonStyle(fullWidth: fullWidth)
    }
}

extension ButtonStyle where Self == AlphonsoSecondaryButtonStyle {
    static var alphonsoSecondary: AlphonsoSecondaryButtonStyle { AlphonsoSecondaryButtonStyle() }
    static func alphonsoSecondary(fullWidth: Bool) -> AlphonsoSecondaryButtonStyle {
        AlphonsoSecondaryButtonStyle(fullWidth: fullWidth)
    }
}

// MARK: - Surfaces

/// A parchment-background card, used in place of plain `List`
/// rows/sections wherever a screen benefits from a distinct grouped
/// surface (lesson cards, leaderboard rows, achievement tiles, etc).
struct AlphonsoCard<Content: View>: View {
    var padding: CGFloat = AlphonsoSpacing.md
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
    }
}

/// A section eyebrow + title pair, matching the web app's small-caps
/// eyebrow treatment (`unit.eyebrow` in `LessonBrowserView`) rather than
/// a plain `Section` header.
struct AlphonsoSectionHeader: View {
    let eyebrow: String?
    let title: String

    init(_ title: String, eyebrow: String? = nil) {
        self.title = title
        self.eyebrow = eyebrow
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let eyebrow {
                Text(eyebrow.uppercased())
                    .font(AlphonsoFont.sans(11, weight: .semiBold))
                    .tracking(0.6)
                    .foregroundStyle(AlphonsoColor.ember)
            }
            Text(title)
                .font(AlphonsoFont.display(20, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
        }
    }
}

// MARK: - Badges & progress

/// A small rounded chip for streaks/XP/league tier/counts -- e.g. "🔥 12"
/// or "Gold League".
struct AlphonsoPillBadge: View {
    let text: String
    var icon: String?
    var tint: Color = AlphonsoColor.moss

    var body: some View {
        HStack(spacing: 4) {
            if let icon {
                Text(icon)
            }
            Text(text)
                .font(AlphonsoFont.sans(13, weight: .semiBold))
        }
        .foregroundStyle(tint)
        .padding(.vertical, 4)
        .padding(.horizontal, AlphonsoSpacing.sm)
        .background(tint.opacity(0.14), in: Capsule())
    }
}

/// A themed replacement for the bare system `ProgressView(value:total:)`
/// used for review-queue/challenge progress -- moss fill on a parchment
/// track instead of the system's default tint.
struct AlphonsoProgressBar: View {
    let progress: Double // 0...1

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(AlphonsoColor.parchment)
                Capsule()
                    .fill(AlphonsoColor.moss)
                    .frame(width: proxy.size.width * min(max(progress, 0), 1))
            }
        }
        .frame(height: 8)
        .animation(.easeOut(duration: 0.25), value: progress)
    }
}

// MARK: - Empty states

struct AlphonsoEmptyState: View {
    let icon: String
    let title: String
    var message: String?

    var body: some View {
        VStack(spacing: AlphonsoSpacing.sm) {
            Image(systemName: icon)
                .font(.system(size: 32))
                .foregroundStyle(AlphonsoColor.moss)
            Text(title)
                .font(AlphonsoFont.display(18, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            if let message {
                Text(message)
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(AlphonsoSpacing.xl)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Motion

/// Scale+opacity entrance driven by a spring, triggered on first appear --
/// SwiftUI's equivalent of the web's Framer Motion spring entrance for
/// celebration moments (`lesson.$id.tsx`'s FinishScreen). Promoted out of
/// `LessonPlayerView`'s original private `SpringEntrance` (where it was
/// shared by the achievement-unlock cards and the league-promotion
/// overlay's badge) so every screen can reuse the same motion language
/// instead of each one inventing its own transition.
struct SpringEntrance: ViewModifier {
    var response: Double = 0.5
    var dampingFraction: Double = 0.65
    var delay: Double = 0
    var minScale: Double = 0.6

    @State private var appeared = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(appeared ? 1 : minScale)
            .opacity(appeared ? 1 : 0)
            .onAppear {
                withAnimation(.spring(response: response, dampingFraction: dampingFraction).delay(delay)) {
                    appeared = true
                }
            }
    }
}

extension View {
    func springEntrance(response: Double = 0.5, dampingFraction: Double = 0.65, delay: Double = 0, minScale: Double = 0.6) -> some View {
        modifier(SpringEntrance(response: response, dampingFraction: dampingFraction, delay: delay, minScale: minScale))
    }
}
