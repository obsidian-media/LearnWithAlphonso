import Foundation

public enum AvatarEarSide: Sendable {
    case left, right
}

/// A source of numbers in 0..<1, injectable so the idle life is deterministic in tests.
public protocol AvatarRandomSource: Sendable {
    mutating func nextUnit() -> Double
}

/// SplitMix64: the same seed always gives the same stream.
public struct AvatarSeededRandom: AvatarRandomSource {
    private var state: UInt64
    public init(seed: UInt64) { state = seed }
    public mutating func nextUnit() -> Double {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        z ^= z >> 31
        return Double(z >> 11) * (1.0 / 9_007_199_254_740_992.0)
    }
}

public struct AvatarSystemRandom: AvatarRandomSource {
    public init() {}
    public mutating func nextUnit() -> Double {
        Double.random(in: 0..<1)
    }
}

/// When the ears twitch and the glint sweeps while he idles. Ears: every 4 to 9 seconds, one random side for about
/// 160 ms. Glint: every 6 to 12 seconds, a sweep of about 700 ms. Drive it with a monotonic clock; `advance` can
/// jump any distance and catches up.
public struct AvatarIdleScheduler<R: AvatarRandomSource>: Sendable {
    public static var earTwitchDuration: TimeInterval { 0.16 }
    public static var glintDuration: TimeInterval { 0.7 }

    private var random: R
    private var nextEar: TimeInterval
    private var earStart: TimeInterval = -.infinity
    private var earSide: AvatarEarSide = .left
    private var nextGlint: TimeInterval
    private var glintStart: TimeInterval = -.infinity

    public private(set) var twitchingEar: AvatarEarSide?
    /// 0 at the start of a sweep, up to just under 1; nil when no sweep is running.
    public private(set) var glintProgress: Double?

    public init(random: R) {
        self.random = random
        nextEar = 0
        nextGlint = 0
        nextEar = interval(4, 9)
        nextGlint = interval(6, 12)
    }

    private mutating func interval(_ low: Double, _ high: Double) -> Double {
        low + random.nextUnit() * (high - low)
    }

    public mutating func advance(to now: TimeInterval) {
        while now >= nextEar {
            earStart = nextEar
            earSide = random.nextUnit() < 0.5 ? .left : .right
            nextEar = earStart + interval(4, 9)
        }
        twitchingEar = now >= earStart && now < earStart + Self.earTwitchDuration ? earSide : nil

        while now >= nextGlint {
            glintStart = nextGlint
            nextGlint = glintStart + interval(6, 12)
        }
        let progress = (now - glintStart) / Self.glintDuration
        glintProgress = progress >= 0 && progress < 1 ? progress : nil
    }
}

/// The slow, continuous body motion: a small breath and a slow sway about the bottom centre.
public enum AvatarIdleMotion {
    public static let breathPeriod: TimeInterval = 4.2
    public static let swayPeriod: TimeInterval = 7

    /// Degrees, within plus or minus 0.45.
    public static func swayDegrees(at time: TimeInterval) -> Double {
        0.45 * sin(2 * Double.pi * time / swayPeriod)
    }

    /// Scale factors from 1 up to 1.007 across and 1.011 tall.
    public static func breathScale(at time: TimeInterval) -> (x: Double, y: Double) {
        let phase = (1 - cos(2 * Double.pi * time / breathPeriod)) / 2
        return (1 + 0.007 * phase, 1 + 0.011 * phase)
    }
}
