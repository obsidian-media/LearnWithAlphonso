import LearnWithAlphonsoKit
import SwiftUI

/// A slow rise and settle so a mascot looks alive at rest -- the iPhone twin of the web's `.mascot-breathe`.
/// Static under Reduce Motion, like `PulsingGlow`: a never-ending loop has no reduced-motion substitute worth keeping.
struct MascotBreathe: ViewModifier {
    var duration: Double = 2.4

    @State private var breathing = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .scaleEffect(breathing ? 1.015 : 1, anchor: .bottom)
            .offset(y: breathing ? -2 : 0)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: duration).repeatForever(autoreverses: true)) {
                    breathing = true
                }
            }
    }
}

extension View {
    func mascotBreathe() -> some View {
        modifier(MascotBreathe())
    }
}

/// A mascot pose on a coloured tile (the cutouts need a ground; the old full-background portraits did not),
/// breathing at rest and cross-fading when the moment's pose changes -- the iPhone twin of the web's `MascotImage`.
struct MascotTile: View {
    let moment: MascotMoment
    var size: CGFloat
    var tone: AlphonsoTileTone
    var radius: CGFloat = 28

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let art = MascotArt.assetName(for: moment)
        ZStack {
            tone.background
            Image(art)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .id(art)
                .transition(.opacity)
                .mascotBreathe()
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: art)
    }
}
