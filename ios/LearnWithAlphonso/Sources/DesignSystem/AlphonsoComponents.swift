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
    var shadow: Color = AlphonsoColor.edgeMoss
    var foreground: Color = AlphonsoColor.surface
    /// false for inline/chip usage (e.g. a word-bank token) where the
    /// button should size to its label instead of filling its container.
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AlphonsoFont.sans(CGFloat(PaywallTextStyle.primaryButtonPointSize), weight: .semiBold))
            .foregroundStyle(foreground)
            .padding(.vertical, AlphonsoSpacing.sm + 2)
            .padding(.horizontal, AlphonsoSpacing.lg)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: AlphonsoSpacing.minTouchTarget)
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
            .sensoryFeedback(.impact(weight: .light), trigger: configuration.isPressed) { _, pressed in pressed && SoundEffectsPreference.isOn() }
    }
}

/// Secondary/outline button: surface fill, hairline border, ink text, and
/// the same chunky bottom edge as the primary button, in hairline, so every
/// button presses down the same way.
struct AlphonsoSecondaryButtonStyle: ButtonStyle {
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AlphonsoFont.sans(15, weight: .medium))
            .foregroundStyle(AlphonsoColor.ink)
            .padding(.vertical, AlphonsoSpacing.sm)
            .padding(.horizontal, AlphonsoSpacing.md)
            // About 36 pt before (8 pt padding around a 15 pt font). An inline icon button
            // (the friend nudge) also gets the minimum width.
            .frame(minWidth: AlphonsoSpacing.minTouchTarget, maxWidth: fullWidth ? .infinity : nil, minHeight: AlphonsoSpacing.minTouchTarget)
            .background(AlphonsoColor.surface, in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                    .strokeBorder(AlphonsoColor.hairline, lineWidth: 2)
            )
            .offset(y: configuration.isPressed ? 3 : 0)
            .background(
                RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                    .fill(AlphonsoColor.hairline)
                    .offset(y: configuration.isPressed ? 0 : 3)
            )
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .sensoryFeedback(.impact(weight: .light), trigger: configuration.isPressed) { _, pressed in pressed && SoundEffectsPreference.isOn() }
    }
}

extension ButtonStyle where Self == AlphonsoPrimaryButtonStyle {
    static var alphonsoPrimary: AlphonsoPrimaryButtonStyle {
        AlphonsoPrimaryButtonStyle(foreground: AlphonsoColor.onPrimary)
    }
    static var alphonsoEmber: AlphonsoPrimaryButtonStyle {
        AlphonsoPrimaryButtonStyle(tint: AlphonsoColor.ember, shadow: AlphonsoColor.edgeEmber, foreground: AlphonsoColor.onAccent)
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
    /// Tappable cards get a soft lift so they read as buttons; plain surfaces stay flat.
    var elevated: Bool = false
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .background(
                elevated ? AlphonsoColor.surface : AlphonsoColor.parchment,
                in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous)
            )
            .alphonsoLift(elevated)
    }
}

extension View {
    /// The soft two-layer shadow for tappable cards and tiles (web: `card-lift`).
    @ViewBuilder
    func alphonsoLift(_ on: Bool = true) -> some View {
        if on {
            self
                .shadow(color: AlphonsoColor.ink.opacity(0.08), radius: 1, y: 1)
                .shadow(color: AlphonsoColor.ink.opacity(0.14), radius: 8, y: 6)
        } else {
            self
        }
    }
}

/// A colour tile with a 3D icon, a title and an optional one-line description
/// (web: `TileCard`). Presentational: wrap it in a Button or NavigationLink.
struct AlphonsoTile: View {
    let tone: AlphonsoTileTone
    let emoji: String
    let title: String
    var subtitle: String?
    /// A frosted-glass tile (tinted by its tone) for screens that sit on a scene, instead of the solid colour tile.
    var glass: Bool = false

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: AlphonsoRadius.xl + 6, style: .continuous)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Icon3DView(emoji: emoji, size: 44)
            Text(title)
                .font(AlphonsoFont.display(17, weight: .bold))
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            if let subtitle {
                Text(subtitle)
                    .font(AlphonsoFont.sans(13))
                    .opacity(0.8)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(glass ? AlphonsoColor.ink : tone.ink)
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading)
        .background(glass ? tone.background.opacity(0.3) : tone.background, in: shape)
        .background(glass ? AnyShapeStyle(.regularMaterial) : AnyShapeStyle(Color.clear), in: shape)
        .alphonsoLift()
        .accessibilityElement(children: .combine)
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
                Icon3DView(emoji: icon, size: 20)
            }
            Text(text)
                .font(AlphonsoFont.display(15, weight: .bold))
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
                // A moss gradient with a soft highlight along the top, so the bar reads as a solid piece.
                Capsule()
                    .fill(LinearGradient(colors: [AlphonsoColor.moss, AlphonsoColor.edgeMoss], startPoint: .top, endPoint: .bottom))
                    .overlay(alignment: .top) {
                        Capsule().fill(Color.white.opacity(0.28)).frame(height: 3).padding(.horizontal, 6).padding(.top, 2)
                    }
                    .frame(width: proxy.size.width * min(max(progress, 0), 1))
            }
        }
        .frame(height: 12)
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            // The scale-up is the part Reduced Motion guidance actually
            // targets -- always rendered at full scale when it's on, so
            // nothing visibly grows into place.
            .scaleEffect(reduceMotion || appeared ? 1 : minScale)
            .opacity(appeared ? 1 : 0)
            .onAppear {
                // A plain cross-fade is Apple's own standard substitute for
                // a showier entrance under Reduced Motion -- not something
                // that needs disabling itself, just decoupled from the
                // spring curve that was driving the scale too.
                withAnimation(reduceMotion ? .easeInOut(duration: 0.2).delay(delay) : .spring(response: response, dampingFraction: dampingFraction).delay(delay)) {
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPulsing ? scale : 1)
            .onAppear {
                // An infinite, never-stopping loop is exactly what Reduced
                // Motion guidance calls out first -- unlike SpringEntrance's
                // one-shot fade, there's no reduced-motion-friendly
                // substitute for "constantly pulsing" worth keeping; this
                // element is simply static when it's on.
                guard !reduceMotion else { return }
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

    /// The everyday pose a banner named only by its mascot shows (the web's `MASCOT_MOMENT`).
    var everydayMoment: MascotMoment {
        switch self {
        case .alphonso: return .learnGreeting
        case .hector: return .hectorIdle
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
/// portrait). Not theme-specific -- either theme can use this, it just
/// reads `AlphonsoColor.moss`/`.parchment` like everything else here.
struct AlphonsoMascotBanner: View {
    let mascot: AlphonsoMascot
    let message: String
    /// The moment picks the pose (falling back to the base image until that pose is bundled).
    var moment: MascotMoment? = nil

    var body: some View {
        HStack(spacing: AlphonsoSpacing.sm + 4) {
            MascotTile(moment: moment ?? mascot.everydayMoment, size: 52, tone: .sun, radius: AlphonsoRadius.lg)
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
                Icon3DView(emoji: leadingEmoji, size: 36)
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
                    .font(AlphonsoFont.display(17, weight: .semiBold))
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
    /// The course to file a tapped word under, or nil (the default) to keep the
    /// explanation plain text. Opt-in on purpose: only a caller that knows the
    /// text is wholly in the course's language (see `SavedWordPolicy`) passes it.
    var saveCourse: String? = nil
    /// With `saveCourse`: the course-language strings that are tappable (French and Spanish), or nil
    /// for text wholly in the course's language (English).
    var courseSpans: [String]? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.saveWordHandler) private var saveWordHandler

    /// What the explanation offers for saving, or nil for plain text (`TappableText.Mode.lesson`).
    private var tapMode: TappableText.Mode? {
        guard let saveCourse else { return nil }
        let mode = TappableText.Mode.lesson(course: saveCourse, spans: courseSpans)
        return mode == .plain ? nil : mode
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Alphonso says")
                    .font(AlphonsoFont.sans(11, weight: .semiBold))
                    .tracking(0.3)
                    .foregroundStyle(AlphonsoColor.ember)
                if let saveCourse, let saveWordHandler, let mode = tapMode {
                    TappableText(
                        text: explanation, color: AlphonsoColor.ink, course: saveCourse,
                        mode: mode, onSave: saveWordHandler
                    )
                    .font(AlphonsoFont.sans(14))
                } else {
                    Text(explanation)
                        .font(AlphonsoFont.sans(14))
                        .foregroundStyle(AlphonsoColor.ink)
                }
            }
            .padding(AlphonsoSpacing.sm + 4)
            .padding(.trailing, AlphonsoSpacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            // A plain card now: the bubble's tail used to point at his portrait, which moved to the verdict panel.
            .background(
                RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous).fill(AlphonsoColor.parchment)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                    .strokeBorder(AlphonsoColor.ember.opacity(0.45), lineWidth: 1)
            )

            // Alphonso himself now reacts in the verdict panel below (AnswerVerdictPanel), so the tip card no longer
            // carries his portrait: he would be on screen twice.
        }
        // The slide-in-from-trailing-edge is what Reduced Motion targets --
        // a plain opacity fade in both directions is the substitute,
        // instead of dropping the transition (and its "something just
        // appeared" cue) entirely.
        .transition(
            reduceMotion
                ? .opacity
                : .asymmetric(
                    insertion: .move(edge: .trailing).combined(with: .opacity),
                    removal: .opacity
                )
        )
        // "Incorrect" is prepended here, not just implied by which branch of
        // ExplanationView rendered -- a sighted learner infers wrong-answer
        // from this card's whole look (Alphonso popping up, the speech-
        // bubble style); nothing about that is available to VoiceOver
        // without saying it outright. Combine folds "Alphonso says" +
        // explanation into one stop instead of two.
        //
        // When the words are tappable (saving is offered) that fold would hide
        // them: a combined element exposes no child links to VoiceOver, so a
        // VoiceOver user could hear the explanation but never save a word from
        // it (CodeRabbit, and the phase 3 reviewer). Then the card is a
        // CONTAINER whose label is just "Incorrect." -- the children read
        // themselves ("Alphonso says", then the explanation with its links), so
        // nothing is spoken twice. Everywhere else the original single stop is
        // unchanged.
        .accessibilityElement(children: linksReachable ? .contain : .combine)
        .accessibilityLabel(linksReachable ? "Incorrect." : "Incorrect. Alphonso says: \(explanation)")
    }

    /// Whether the explanation's words are tappable links (see `body`).
    private var linksReachable: Bool {
        saveCourse != nil && saveWordHandler != nil
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
    /// Inside the lesson's verdict sheet (round 6): the sheet already says right or wrong with Alphonso's face, so
    /// this is only the one-line why, in the body type, with no tip card and no second announcement.
    var inSheet = false

    @Environment(\.saveWordHandler) private var saveWordHandler
    @Environment(\.alphonsoDS) private var ds
    /// The lesson and review set this: their verdict panel announces the verdict, and a second post in the same
    /// frame would cut it off.
    @Environment(\.verdictAnnouncedByPanel) private var verdictAnnouncedByPanel

    private var isCorrect: Bool {
        correctOverride ?? isAnswerCorrect(question, picked: picked, course: course)
    }

    /// What this explanation offers for saving (`SavedWordPolicy`): every word in the English course, only
    /// the course-language text the question proves in French and Spanish, nothing otherwise.
    private var scope: SavedWordPolicy.Scope {
        SavedWordPolicy.scope(for: question, explanation: explanation, inCourse: course.translationCourseCode)
    }

    /// The course to file a tapped word under, or nil when nothing here may be saved.
    private var saveCourse: String? {
        scope == .none ? nil : course.translationCourseCode
    }

    private var courseSpans: [String]? {
        if case .spans(let spans) = scope { return spans }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            explanationContent
            // Words are styled as plain text, so tell the learner they are
            // tappable -- but only the first few times (`SavedWordHint`).
            if saveCourse != nil, saveWordHandler != nil {
                SaveWordHintLine()
            }
        }
    }

    private var explanationContent: some View {
        Group {
            if inSheet {
                correctCaption
            } else if isCorrect {
                correctCaption
                    // Same reasoning as AlphonsoTipCard's label below: a
                    // sighted learner reads "no Alphonso popup" as "you got
                    // it right," which VoiceOver has no equivalent of.
                    .accessibilityLabel("Correct. \(explanation)")
            } else {
                AlphonsoTipCard(explanation: explanation, saveCourse: saveCourse, courseSpans: courseSpans)
            }
        }
        // Proactively announced, not just readable-if-you-swipe-to-it --
        // this is the moment a sighted learner sees color/icon/card-style
        // flip to tell them right/wrong; without an explicit announcement
        // here a VoiceOver user only learns the verdict by manually
        // navigating to this exact element, which "does it work without
        // looking at the screen" needs to not require.
        .onAppear {
            guard !verdictAnnouncedByPanel, !inSheet else { return }
            UIAccessibility.post(notification: .announcement, argument: isCorrect ? "Correct" : "Incorrect")
        }
    }

    /// The plain caption shown for a right answer: its words are tappable when
    /// saving is allowed for this course and the screen can open a save sheet.
    @ViewBuilder
    private var correctCaption: some View {
        if let saveCourse, let saveWordHandler {
            TappableText(
                text: explanation, color: inSheet ? ds.ink : AlphonsoColor.inkSoft, course: saveCourse,
                mode: .lesson(course: saveCourse, spans: courseSpans), onSave: saveWordHandler
            )
            .font(inSheet ? AlphonsoDS.font(.body) : AlphonsoFont.sans(13))
        } else {
            Text(explanation)
                .font(inSheet ? AlphonsoDS.font(.body) : AlphonsoFont.sans(13))
                .foregroundStyle(inSheet ? ds.ink : AlphonsoColor.inkSoft)
        }
    }
}

/// "Tap a word to save it." under a lesson explanation, shown only the first
/// few times (`SavedWordHint`) -- a permanent line under every explanation would
/// be noise across a ten-question lesson. The count lives in UserDefaults so it
/// survives relaunches; whether to show is decided once when the line appears
/// (`visible`), so it does not vanish while the learner is still reading it.
struct SaveWordHintLine: View {
    @AppStorage("savedWordHintShownCount") private var timesShown = 0
    @State private var visible = false

    var body: some View {
        // The decision runs from a zero-size anchor that is always in the tree. `.onAppear` on the conditional line
        // itself never fires while `visible` is false, because a view that draws nothing never appears.
        ZStack {
            Color.clear
                .frame(width: 0, height: 0)
                .accessibilityHidden(true)
                .onAppear {
                    guard SavedWordHint.shouldShow(timesShown: timesShown) else { return }
                    visible = true
                    timesShown += 1
                }
            if visible {
                Text("Tap a word to save it.")
                    .font(AlphonsoFont.sans(11))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
        }
    }
}
