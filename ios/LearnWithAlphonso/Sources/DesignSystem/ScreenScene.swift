import SwiftUI

/// The five approved scenes (Visual refresh part 2). Each is the image set `Scene-<name>`, a 1080x1920 portrait.
enum SceneName: String, CaseIterable {
    case learn, hector, listen, profile, complete, practice

    var assetName: String { "Scene-\(rawValue)" }
}

/// What the probe row tells its scene: where it is, and when it comes on or goes off screen.
enum SceneScrollEvent {
    case moved(CGFloat)
    case appeared
    case disappeared
}

private struct SceneScrollReporterKey: EnvironmentKey {
    static let defaultValue: (SceneScrollEvent) -> Void = { _ in }
}

extension EnvironmentValues {
    /// Set by `SceneScrollHost`; the probe calls it.
    var sceneScrollReporter: (SceneScrollEvent) -> Void {
        get { self[SceneScrollReporterKey.self] }
        set { self[SceneScrollReporterKey.self] = newValue }
    }
}

/// Reports a row's global top edge to the enclosing scene. Put it (through `sceneScrollProbe()`) on a row near
/// the top of the scrolling content. It also reports leaving the screen: a List recycles the row, and a position
/// read from a recycled row is not where the list is (Learn's greeting bubble came back after a long scroll).
struct SceneScrollProbe: View {
    @Environment(\.sceneScrollReporter) private var report

    var body: some View {
        Color.clear
            .onGeometryChange(for: CGFloat.self) { proxy in
                proxy.frame(in: .global).minY
            } action: { minY in
                report(.moved(minY))
            }
            .onAppear { report(.appeared) }
            .onDisappear { report(.disappeared) }
            .accessibilityHidden(true)
    }
}

/// Holds the scroll position in its own state, so only the scene background re-renders while scrolling, never
/// the screen that hosts it.
struct SceneScrollHost: ViewModifier {
    let scene: SceneName
    var clip: ClipName? = nil
    var clipAnchor: CGFloat = 1
    var pin: ClipPin? = nil

    @State private var offset: CGFloat?
    @State private var probeVisible = true

    func body(content: Content) -> some View {
        content
            .environment(\.sceneScrollReporter, report)
            .background {
                ScreenScene(scene: scene, rawOffset: offset, clip: clip, clipAnchor: clipAnchor, pin: pin,
                            probeVisible: probeVisible)
            }
    }

    private func report(_ event: SceneScrollEvent) {
        switch event {
        case .appeared:
            probeVisible = true
        case .disappeared:
            probeVisible = false
        case .moved(let minY):
            guard probeVisible else { return }
            offset = minY
        }
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
    /// A living clip instead of the still image (the still stays the fallback for every screen without one).
    var clip: ClipName? = nil
    /// Where the clip sits vertically when the screen is wider than 9:16 would allow (1 = bottom-aligned).
    var clipAnchor: CGFloat = 1
    /// Something drawn on the clip, in the clip's own coordinates.
    var pin: ClipPin? = nil
    /// False while the probe row is off screen: the pin stays hidden then, whatever was last reported.
    var probeVisible: Bool = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @State private var baseline: CGFloat?
    /// The last scroll distance seen (kept when the probe row scrolls out of the lazy list).
    @State private var held: CGFloat = 0

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                backdrop
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
                // The pin (a speech bubble) sits above the scrim so it keeps its own contrast, laid out in the same
                // frame and moved the same way as the clip, and it fades out in the first 60 pt of scroll.
                if let clip, pin != nil {
                    ClipBackdrop(clip: clip, verticalAnchor: clipAnchor, pin: pin, showsClip: false)
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .scaleEffect(reduceMotion ? 1 : Self.overscan)
                        .offset(y: reduceMotion ? 0 : travel(height: proxy.size.height))
                        .clipped()
                        .opacity(pinOpacity)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
        .allowsHitTesting(false)
        // Tracked under Reduce Motion too: the pin's fade is not motion. Only the parallax travel is gated.
        .onChange(of: rawOffset) { _, new in
            guard let new else { return }
            if baseline == nil { baseline = new }
            held = new - (baseline ?? new)
        }
    }

    /// Fully shown at rest, gone after 60 pt of scroll in either direction.
    private var pinOpacity: Double {
        guard probeVisible else { return 0 }
        return max(0, 1 - Double(abs(held)) / 60)
    }

    /// The clip when this screen has one, otherwise the scene still. Its pin is drawn in a layer above the scrim.
    @ViewBuilder
    private var backdrop: some View {
        if let clip {
            ClipBackdrop(clip: clip, verticalAnchor: clipAnchor)
        } else {
            Image(scene.assetName)
                .resizable()
                .scaledToFill()
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
        modifier(SceneScrollHost(scene: scene))
    }

    /// The scene's living clip behind this screen, with an optional pin (a speech bubble) in the clip's own frame.
    func screenScene(_ scene: SceneName, clip: ClipName, clipAnchor: CGFloat = 1, pin: ClipPin? = nil) -> some View {
        modifier(SceneScrollHost(scene: scene, clip: clip, clipAnchor: clipAnchor, pin: pin))
    }

    /// The clip version of `screenScene(_:if:)`: the clip only when `show` is true.
    @ViewBuilder
    func screenScene(_ scene: SceneName, clip: ClipName, clipAnchor: CGFloat = 1, if show: Bool) -> some View {
        if show { screenScene(scene, clip: clip, clipAnchor: clipAnchor) } else { self }
    }

    /// `screenScene` only when `show` is true, for a view that sometimes sits on a scene painted further out.
    @ViewBuilder
    func screenScene(_ scene: SceneName, if show: Bool) -> some View {
        if show { screenScene(scene) } else { self }
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
