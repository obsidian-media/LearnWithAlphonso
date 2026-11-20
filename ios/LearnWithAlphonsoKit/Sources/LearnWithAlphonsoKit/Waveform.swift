import Foundation

/// The bars of a "Hear you vs Alphonso" waveform in Say it right. Mirrors src/lib/waveform.ts (web) and
/// core/logic/Waveform.kt (Android); the three test suites assert the same fixtures.
public enum Waveform {
    /// How many bars each waveform draws (the spec says about 40 to 60).
    public static let bars = 48

    /// "Say it slower": the model replays at this fraction of normal speed, on the device (no second /api/tts call).
    public static let slowRate: Float = 0.75

    /// Downsamples audio samples (any scale, sign ignored) to `bars` heights in 0...1: the samples are cut into `bars`
    /// equal buckets (bucket i is `[i*n/bars, (i+1)*n/bars)` in whole-number arithmetic), each bucket's height is its
    /// loudest absolute sample, and the row is divided by the loudest bucket so the tallest bar is 1. An empty bucket,
    /// a silent clip and no samples at all give 0 (the screen draws those as a flat row).
    public static func peaks(_ samples: [Float], bars: Int = Waveform.bars) -> [Double] {
        let count = max(0, bars)
        var out = [Double](repeating: 0, count: count)
        let n = samples.count
        guard n > 0, count > 0 else { return out }
        var loudest = 0.0
        for i in 0..<count {
            let from = (i * n) / count
            let to = ((i + 1) * n) / count
            var peak = 0.0
            if from < to {
                for j in from..<to {
                    let a = abs(Double(samples[j]))
                    if a > peak { peak = a }
                }
            }
            out[i] = peak
            if peak > loudest { loudest = peak }
        }
        guard loudest > 0 else { return out }
        return out.map { $0 / loudest }
    }
}
