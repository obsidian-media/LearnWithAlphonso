import SwiftUI

/// A whole number that counts up as its `number` is animated (0 to its value), keeping any text around it
/// ("+25", "80%"). Animatable, so SwiftUI re-renders it every frame of the surrounding `withAnimation`.
struct CountingText: View, Animatable {
    var number: Double
    var prefix: String = ""
    var suffix: String = ""

    var animatableData: Double {
        get { number }
        set { number = newValue }
    }

    var body: some View {
        Text("\(prefix)\(Int(number.rounded()))\(suffix)")
    }
}

/// Splits a reward value such as "+25" or "7" into the text before the number, the number and the text after it.
enum RewardCountUp {
    /// How long the numbers take to count up from 0.
    static let duration: Double = 0.8

    static func split(_ value: String) -> (prefix: String, number: Int, suffix: String)? {
        guard let start = value.firstIndex(where: \.isNumber) else { return nil }
        let rest = value[start...]
        let digits = rest.prefix(while: \.isNumber)
        guard let number = Int(digits) else { return nil }
        return (String(value[..<start]), number, String(rest.dropFirst(digits.count)))
    }
}

/// A one-shot burst of confetti falling over the whole screen, drawn in a `Canvas` (no package, no assets).
/// Shows nothing at all under Reduce Motion. Decorative, so hidden from VoiceOver and never takes a touch.
struct ConfettiBurst: View {
    var pieceCount: Int = 56
    var duration: Double = 3.2

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()
    @State private var finished = false

    private static let colours: [Color] = [
        Color(red: 1.0, green: 0.78, blue: 0.2),
        Color(red: 0.98, green: 0.42, blue: 0.32),
        Color(red: 0.3, green: 0.72, blue: 0.5),
        Color(red: 0.36, green: 0.58, blue: 0.95),
        Color(red: 0.74, green: 0.5, blue: 0.95),
    ]

    var body: some View {
        Group {
            if reduceMotion || finished {
                Color.clear
            } else {
                TimelineView(.animation) { context in
                    Canvas { gc, size in
                        draw(&gc, size: size, elapsed: context.date.timeIntervalSince(start))
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task {
            guard !reduceMotion else { return }
            start = Date()
            try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
            finished = true
        }
    }

    /// A stable pseudo-random number in 0...1 for a piece and a trait, so a frame never has to remember anything.
    private func unit(_ index: Int, _ salt: Double) -> Double {
        let x = sin(Double(index) * 12.9898 + salt * 78.233) * 43758.5453
        return x - floor(x)
    }

    private func draw(_ gc: inout GraphicsContext, size: CGSize, elapsed: Double) {
        guard elapsed >= 0, elapsed < duration else { return }
        for index in 0..<pieceCount {
            let launch = unit(index, 1) * 0.6
            let t = elapsed - launch
            guard t > 0 else { continue }
            let originX = size.width * (0.15 + 0.7 * unit(index, 2))
            let drift = (unit(index, 3) - 0.5) * 140
            let sway = sin(t * (2 + unit(index, 4) * 3) + unit(index, 5) * 6) * 18
            let speed = 150 + unit(index, 6) * 190
            let x = originX + drift * t * 0.5 + sway
            let y = -24 + speed * t
            let fade = min(1, max(0, (duration - elapsed) / 0.8))
            let w = 6 + unit(index, 7) * 6
            let h = w * (1.4 + unit(index, 8))
            var piece = gc
            piece.opacity = fade
            piece.translateBy(x: x, y: y)
            piece.rotate(by: .radians(t * (2 + unit(index, 9) * 5) + unit(index, 10) * 6))
            piece.fill(
                Path(roundedRect: CGRect(x: -w / 2, y: -h / 2, width: w, height: h), cornerRadius: 1.5),
                with: .color(Self.colours[index % Self.colours.count])
            )
        }
    }
}
