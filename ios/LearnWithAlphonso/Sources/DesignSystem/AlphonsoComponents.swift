import SwiftUI
import UIKit
import LearnWithAlphonsoKit

// MARK: - Buttons

/// Primary CTA button style: moss fill, cream text, and the web app's
/// "hard shadow" pressed effect (`.hard-shadow` in `styles.css` --
/// a solid moss-deep drop shadow that collapses to nothing while the
/// button translates down as it's pressed, giving a tactile/game-like
/// press rather than the default system dimming).
struct AlphonsoPrimaryButtonStyle: ButtonStyle {
    var tint: Color = AlphonsoColor.moss
    var shadow: Color = AlphonsoColor.mossDeep
    var foreground: Color = AlphonsoColor.surface
    /// false for inline/chip usage (e.g. a word-bank token) where the
    /// button should size to its label instead of filling its container.
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AlphonsoFont.sans(17, weight: .semiBold))
            .foregroundStyle(foreground)
            .padding(.vertical, AlphonsoSpacing.sm + 2)
            .padding(.horizontal, AlphonsoSpacing.lg)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            // A subtle top-to-bottom gradient instead of a flat fill --
            // one of several small touches (see also PulsingGlow,
            // SpringEntrance's now-broader use) added after direct
            // feedback that solid-color, static UI read as "not alive."
            .background(
                LinearGradient(colors: [tint, shadow], startPoint: .top, endPoint: .bottom),
                in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
            )
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
    static var alphonsoPrimary: AlphonsoPrimaryButtonStyle {
        AlphonsoPrimaryButtonStyle(foreground: AlphonsoColor.onPrimary)
    }
    static var alphonsoEmber: AlphonsoPrimaryButtonStyle {
        AlphonsoPrimaryButtonStyle(tint: AlphonsoColor.ember, shadow: AlphonsoColor.ember.opacity(0.65), foreground: AlphonsoColor.onAccent)
    }
    static func alphonsoPrimary(fullWidth: Bool) -> AlphonsoPrimaryButtonStyle {
        AlphonsoPrimaryButtonStyle(foreground: AlphonsoColor.onPrimary, fullWidth: fullWidth)
    }
}

extension ButtonStyle where Self == AlphonsoSecondaryButtonStyle {
    static var alphonsoSecondary: AlphonsoSecondaryButtonStyle { AlphonsoSecondaryButtonStyle() }
    static func alphonsoSecondary(fullWidth: Bool) -> AlphonsoSecondaryButtonStyle {
        AlphonsoSecondaryButtonStyle(fullWidth: fullWidth)
    }
}

extension View {
    /// Parchment-filled input background with a visible hairline border.
    /// Parchment-vs-surface alone is a deliberately subtle two-shade
    /// difference (matches the web app's own design), which read as
    /// "input field is invisible" on a real device -- this is the fix,
    /// centralized so every TextField/input across the app shares one
    /// definition instead of repeating background+overlay at each call
    /// site (found via real device screenshots, not simulated).
    func alphonsoInputBackground(radius: CGFloat = AlphonsoRadius.md) -> some View {
        self
            .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(AlphonsoColor.hairline, lineWidth: 1)
            )
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

// MARK: - Course picker

/// Shared by LessonBrowserView and ReviewQueueView -- was two separately
/// duplicated Pickers using full course names ("English"/"Français"/
/// "Español") in a `.segmented` style. First fix (flag + 2-letter code)
/// wasn't enough on its own: a real device screenshot showed the
/// `.segmented` control itself is too narrow in a `.topBarLeading` slot
/// competing with a large navigationTitle -- three segments squeezed into
/// that width clipped even the compact flag+code labels down to unreadable
/// vertical slivers. The real fix is the control, not the label: `.menu`
/// style only ever has to render *one* selection in the toolbar (plus a
/// chevron), so there's no per-segment width to divide -- tapping opens a
/// full-width menu where "🇬🇧 EN" etc. always has room.
struct CoursePicker: View {
    @Binding var course: Course

    var body: some View {
        Picker("Course", selection: $course) {
            Text("🇬🇧 EN").tag(Course.english)
            Text("🇫🇷 FR").tag(Course.french)
            Text("🇪🇸 ES").tag(Course.spanish)
        }
        .pickerStyle(.menu)
    }
}

// MARK: - Motion: ambient life

/// A slow, continuous scale+glow pulse -- used on the streak flame in
/// StatusHeaderView so the app has at least one element that's always
/// quietly *alive* rather than only animating in reaction to a tap.
struct PulsingGlow: ViewModifier {
    var scale: CGFloat = 1.12
    var duration: Double = 1.4

    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPulsing ? scale : 1)
            .onAppear {
                withAnimation(.easeInOut(duration: duration).repeatForever(autoreverses: true)) {
                    isPulsing = true
                }
            }
    }
}

extension View {
    func pulsingGlow(scale: CGFloat = 1.12, duration: Double = 1.4) -> some View {
        modifier(PulsingGlow(scale: scale, duration: duration))
    }
}

// MARK: - Mascot banner

/// Which named mascot a banner shows -- keeps call sites from passing a
/// raw asset-name string (a typo there fails silently at runtime, not at
/// compile time, since `Image(_:)` has no compile-time asset checking).
enum AlphonsoMascot {
    case alphonso
    case hector

    var assetName: String {
        switch self {
        case .alphonso: return "Alphonso"
        case .hector: return "Hector"
        }
    }

    /// VoiceOver needs a real description, not just a decorative image --
    /// the portrait is communicating something (who's "speaking"), not
    /// just decoration. Combined with `message` at the call site for the
    /// full accessibility label (see `AlphonsoMascotBanner.body`).
    var accessibilityName: String {
        switch self {
        case .alphonso: return "Alphonso"
        case .hector: return "Hector"
        }
    }
}

/// A mascot portrait + a short line of copy on a colored/gradient card --
/// the shared replacement for the "plain text, no imagery" pattern found
/// on the paywall, auth, and Learn-tab-home hero spots (see the design
/// spec's Background section: the concrete before/after example was
/// PaywallView showing an SF Symbol instead of Hector's actual bundled
/// portrait). Not Canopy-specific -- any theme can use this, it just
/// reads `AlphonsoColor.moss`/`.parchment` like everything else here.
struct AlphonsoMascotBanner: View {
    let mascot: AlphonsoMascot
    let message: String

    var body: some View {
        HStack(spacing: AlphonsoSpacing.sm + 4) {
            Image(mascot.assetName)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 52, height: 52)
                .clipShape(RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                        .strokeBorder(.white.opacity(0.6), lineWidth: 2)
                )

            Text(message)
                .font(AlphonsoFont.sans(14, weight: .bold))
                .foregroundStyle(AlphonsoColor.onMossGradient)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
        .padding(AlphonsoSpacing.md)
        .background(
            LinearGradient(colors: [AlphonsoColor.moss, AlphonsoColor.mossDeep], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(mascot.accessibilityName): \(message)")
    }
}

// MARK: - Row card

/// A rounded card row (status dot + title + subtitle) for use as `List`
/// row *content* -- deliberately not a replacement for `List`/`Section`
/// itself (keeps lazy loading, `.searchable`, toolbar/navigation
/// integration all working exactly as they do today; see the design
/// spec's "New shared components" section for why this stays row content
/// rather than migrating to a `LazyVStack`). Replaces the current
/// plain-`Text`-only row pattern (e.g. `LessonBrowserView`'s lesson
/// rows) that's part of what read as "an empty piece of background with
/// some written knowledge on it" (the real user quote already in
/// `StatusHeaderView.swift`'s doc comment).
struct AlphonsoRowCard: View {
    let title: String
    let subtitle: String
    /// Status-dot color -- e.g. `.moss` for available, `.ember` for
    /// today's/next recommended item, `AlphonsoColor.hairline` for
    /// locked/dimmed. Callers pass an explicit color rather than this
    /// component inferring state, since "what counts as next/locked"
    /// is different per screen (lesson unlock order vs. review-queue
    /// due date vs. leaderboard rank).
    var accent: Color = AlphonsoColor.moss
    /// An emoji shown in place of the accent dot when present -- used by
    /// scenario/campaign pickers where the emoji itself is the
    /// meaningful visual (a specific scene's character), not just a
    /// status indicator. `nil` (the default) keeps every existing call
    /// site's plain accent-dot appearance unchanged.
    var leadingEmoji: String? = nil

    var body: some View {
        HStack(spacing: AlphonsoSpacing.sm + 2) {
            if let leadingEmoji {
                Text(leadingEmoji).font(.largeTitle)
                    // Purely decorative here -- the emoji illustrates the
                    // row, it doesn't carry information title/subtitle
                    // don't already say. Without this, VoiceOver enumerates
                    // it as its own stop (reading the emoji's own name,
                    // e.g. "trophy") right before the title on every single
                    // one of this component's 11+ call sites, including
                    // ones on the primary lesson-start flow
                    // (LessonBrowserView, ListenView).
                    .accessibilityHidden(true)
            } else {
                Circle()
                    .fill(accent)
                    .frame(width: 8, height: 8)
                    .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AlphonsoFont.sans(16, weight: .medium))
                    .foregroundStyle(AlphonsoColor.ink)
                Text(subtitle)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, AlphonsoSpacing.sm)
        .padding(.horizontal, AlphonsoSpacing.sm + 4)
        .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
        // Combines title+subtitle (and the now-hidden decoration) into one
        // VoiceOver stop reading "<title>, <subtitle>" instead of two
        // separate swipes -- matches how a Button wrapping this already
        // auto-combines its label, but several call sites use this as bare
        // List row content with no wrapping Button, which got no such
        // combining before.
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Mascot

/// A rounded speech-bubble outline with a small tail pointing out its
/// trailing edge -- used by `AlphonsoTipCard` so Alphonso's explanation
/// reads as him actually *speaking* rather than sitting in a plain card.
/// `InsettableShape`, not just `Shape` -- `.strokeBorder(...)` (used here
/// and everywhere else in this design system, e.g. every card's hairline
/// border) requires that conformance; plain `Shape` only has `.stroke(...)`,
/// which centers the line on the path instead of insetting it (a real
/// build failure caught by CI: "value of type 'SpeechBubbleShape' has no
/// member 'strokeBorder'").
struct SpeechBubbleShape: InsettableShape {
    var cornerRadius: CGFloat = AlphonsoRadius.lg
    var tailWidth: CGFloat = 14
    var tailHeight: CGFloat = 16
    private var insetAmount: CGFloat = 0

    func inset(by amount: CGFloat) -> some InsettableShape {
        var copy = self
        copy.insetAmount += amount
        return copy
    }

    func path(in rect: CGRect) -> Path {
        let rect = rect.insetBy(dx: insetAmount, dy: insetAmount)
        let radius = max(0, cornerRadius - insetAmount)
        let bubbleRect = CGRect(x: rect.minX, y: rect.minY, width: rect.width - tailWidth, height: rect.height)
        var path = Path(roundedRect: bubbleRect, cornerRadius: radius)
        // Tail anchored low on the trailing edge, pointing toward Alphonso's
        // portrait (which sits just outside the bubble's trailing edge).
        let tailMidY = rect.maxY - radius - tailHeight / 2
        path.move(to: CGPoint(x: bubbleRect.maxX, y: tailMidY - tailHeight / 2))
        path.addLine(to: CGPoint(x: rect.maxX, y: tailMidY))
        path.addLine(to: CGPoint(x: bubbleRect.maxX, y: tailMidY + tailHeight / 2))
        path.closeSubpath()
        return path
    }
}

/// Alphonso appearing in person to help after a wrong answer -- direct
/// user request: the app has two named personas (Alphonso, the app's
/// own free host; Hector, the Pro AI tutor) with zero visual presence
/// anywhere. Alphonso, not Hector, does wrong-answer help specifically
/// because Hector is a paid persona ($9.99/mo) -- having him "give away"
/// tutoring for free in the ordinary lesson/review flow would undercut
/// the subscription. Used in LessonPlayerView's QuestionCard/
/// GeneratedPracticeSection and ReviewQueueView's ReviewQuestionCard,
/// wherever `checked && !isAnswerCorrect(...)`.
///
/// A bigger, more theatrical version than this card's original small
/// inline-avatar design -- direct user request, with a real speech
/// bubble instead of a plain rounded box. Deliberately still laid out
/// in-flow (part of the same VStack as the Check/Continue button below
/// it, never an absolute overlay), so -- unlike the user's own reference
/// mockup, where Alphonso's cape covered the Check button -- this can
/// never obscure an interactive element regardless of how large the
/// portrait renders.
struct AlphonsoTipCard: View {
    let explanation: String

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Alphonso says")
                    .font(AlphonsoFont.sans(11, weight: .semiBold))
                    .tracking(0.3)
                    .foregroundStyle(AlphonsoColor.ember)
                Text(explanation)
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.ink)
            }
            .padding(AlphonsoSpacing.sm + 4)
            .padding(.trailing, AlphonsoSpacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                SpeechBubbleShape().fill(AlphonsoColor.parchment)
            )
            .overlay(
                SpeechBubbleShape().strokeBorder(AlphonsoColor.ember.opacity(0.45), lineWidth: 1)
            )

            // Portrait, not content -- the mascot's presence is what
            // "Alphonso says" already tells you; without this it's its own
            // unlabeled VoiceOver stop (announcing nothing useful, or the
            // asset name) between "Alphonso says" and the explanation text.
            Image("Alphonso")
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 88, height: 112)
                .clipShape(RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                        .strokeBorder(AlphonsoColor.ember, lineWidth: 2)
                )
                .padding(.leading, -6)
                .accessibilityHidden(true)
        }
        .transition(.asymmetric(
            insertion: .move(edge: .trailing).combined(with: .opacity),
            removal: .opacity
        ))
        // "Incorrect" is prepended here, not just implied by which branch of
        // ExplanationView rendered -- a sighted learner infers wrong-answer
        // from this card's whole look (Alphonso popping up, the speech-
        // bubble style); nothing about that is available to VoiceOver
        // without saying it outright. Combine folds "Alphonso says" +
        // explanation into one stop instead of two.
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Incorrect. Alphonso says: \(explanation)")
    }
}

/// Wraps the checked/wrong-answer-vs-correct-answer branch every
/// question-explanation call site needs -- Alphonso shows up on a wrong
/// answer, a plain caption suffices for a right one (no need for him to
/// pop in just to confirm what the learner already got right).
struct ExplanationView: View {
    let question: Question
    let picked: String?
    let explanation: String
    /// Defaults to `.english` so every pre-existing call site keeps its
    /// exact prior styling without changes -- only affects a "speak"
    /// question's tolerant transcript match. Without this a French speak
    /// answer that isAnswerCorrect(course: .french) graded correct at the
    /// authoritative call site (LessonPlayerView/ReviewQueueView) could
    /// still show "not quite" styling here, independently re-derived with
    /// the wrong (English) normaliser.
    var course: Course = .english
    /// Overrides the derived verdict where the caller knows better than
    /// `isAnswerCorrect` can. That is exactly one case today: a translation,
    /// whose curated phrasings are only a floor and whose real verdict may have
    /// come from the server's AI grader. Without this the card would show the
    /// "not quite" styling over an answer the learner was just told was right.
    var correctOverride: Bool? = nil

    private var isCorrect: Bool {
        correctOverride ?? isAnswerCorrect(question, picked: picked, course: course)
    }

    var body: some View {
        Group {
            if isCorrect {
                Text(explanation)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    // Same reasoning as AlphonsoTipCard's label below: a
                    // sighted learner reads "no Alphonso popup" as "you got
                    // it right," which VoiceOver has no equivalent of.
                    .accessibilityLabel("Correct. \(explanation)")
            } else {
                AlphonsoTipCard(explanation: explanation)
            }
        }
        // Proactively announced, not just readable-if-you-swipe-to-it --
        // this is the moment a sighted learner sees color/icon/card-style
        // flip to tell them right/wrong; without an explicit announcement
        // here a VoiceOver user only learns the verdict by manually
        // navigating to this exact element, which "does it work without
        // looking at the screen" needs to not require.
        .onAppear {
            UIAccessibility.post(notification: .announcement, argument: isCorrect ? "Correct" : "Incorrect")
        }
    }
}
