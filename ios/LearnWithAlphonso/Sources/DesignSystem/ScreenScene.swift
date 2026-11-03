import SwiftUI

/// The five approved scenes (Visual refresh part 2). Each is the image set `Scene-<name>`, a 1080x1920 portrait.
enum SceneName: String, CaseIterable {
    case learn, hector, listen, profile, complete

    var assetName: String { "Scene-\(rawValue)" }
}

/// The raw global-space position of whatever row carries `sceneScrollProbe()`. Travels up the view tree as a
/// preference, so only the scene background re-renders while scrolling, never the screen that hosts it.
struct SceneScrollKey: PreferenceKey {
    static var defaultValue: CGFloat? { nil }
    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) {
        value = nextValue() ?? value
    }
}

/// Zero-cost reporter of a row's global top edge. Put it (through `sceneScrollProbe()`) on a row near the top
/// of the scrolling content.
struct SceneScrollProbe: View {
    var body: some View {
        GeometryReader { proxy in
            Color.clear.preference(key: SceneScrollKey.self, value: proxy.frame(in: .global).minY)
        }
        .accessibilityHidden(true)
    }
}

/// A scene image full-bleed behind a screen: a readability scrim from the top (darker in dark mode, and it
/// follows the theme's own surface colour so Studio Ink keeps its character), and gentle parallax.
///
/// Parallax: the content scrolls by `d`, the image by half of that. It is static under Reduce Motion (no
/// movement, and no overscan scale either, since nothing needs the slack). Text never sits straight on a scene:
/// use `alphonsoGlass` or an existing card surface.
struct ScreenScene: View {
    /// Content scrolls at 1x, the scene at half that speed.
    static let parallaxFactor: CGFloat = 0.5
    /// The image is drawn a little larger so the parallax travel never uncovers an edge.
    private static let overscan: CGFloat = 1.14

    let scene: SceneName
    /// The probe's raw position, nil while no probe is on screen.
    var rawOffset: CGFloat? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @State private var baseline: CGFloat?
    /// The last scroll distance seen (kept when the probe row scrolls out of the lazy list).
    @State private var held: CGFloat = 0

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Image(scene.assetName)
                    .resizable()
                    .scaledToFill()
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .scaleEffect(reduceMotion ? 1 : Self.overscan)
                    .offset(y: reduceMotion ? 0 : travel(height: proxy.size.height))
                    .clipped()
                LinearGradient(
                    stops: [
                        .init(color: AlphonsoColor.surface.opacity(colorScheme == .dark ? 0.88 : 0.6), location: 0),
                        .init(color: AlphonsoColor.surface.opacity(colorScheme == .dark ? 0.6 : 0.18), location: 0.45),
                        .init(color: AlphonsoColor.surface.opacity(colorScheme == .dark ? 0.7 : 0.3), location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
        .allowsHitTesting(false)
        .onChange(of: rawOffset) { _, new in
            guard !reduceMotion, let new else { return }
            if baseline == nil { baseline = new }
            held = new - (baseline ?? new)
        }
    }

    /// Half the scroll distance, never more than the overscan can cover.
    private func travel(height: CGFloat) -> CGFloat {
        let limit = height * (Self.overscan - 1) / 2
        return min(max(held * Self.parallaxFactor, -limit), limit)
    }
}

extension View {
    /// Puts a scene behind this screen. Pair it with `sceneScrollProbe()` on a top row for parallax.
    func screenScene(_ scene: SceneName) -> some View {
        backgroundPreferenceValue(SceneScrollKey.self) { offset in
            ScreenScene(scene: scene, rawOffset: offset)
        }
    }

    /// Reports this row's position to the enclosing `screenScene`.
    func sceneScrollProbe() -> some View {
        background(SceneScrollProbe())
    }

    /// A frosted-glass card: the surface text sits on when the screen behind it is a scene.
    func alphonsoGlass(radius: CGFloat = AlphonsoRadius.xl + 6) -> some View {
        background(.regularMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(.white.opacity(0.28), lineWidth: 1)
            )
            .alphonsoLift()
    }
}

extension View {
    /// Glass only when `condition` holds (a screen that sits on a scene in one place and a flat surface in another).
    @ViewBuilder
    func alphonsoGlass(if condition: Bool, radius: CGFloat = AlphonsoRadius.xl + 6) -> some View {
        if condition {
            alphonsoGlass(radius: radius)
        } else {
            self
        }
    }
}

/// A full-body figure standing on a soft ground shadow, breathing at rest (still under Reduce Motion).
struct SceneFigure: View {
    let assetName: String
    var height: CGFloat

    var body: some View {
        ZStack(alignment: .bottom) {
            Ellipse()
                .fill(.black.opacity(0.28))
                .frame(width: height * 0.5, height: height * 0.07)
                .blur(radius: 6)
                .offset(y: 2)
            Image(assetName)
                .resizable()
                .scaledToFit()
                .frame(height: height)
                .mascotBreathe()
        }
        .accessibilityHidden(true)
    }
}
