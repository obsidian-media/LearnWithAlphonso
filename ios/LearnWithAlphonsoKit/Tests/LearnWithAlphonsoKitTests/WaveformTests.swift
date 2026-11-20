import XCTest
@testable import LearnWithAlphonsoKit

final class WaveformTests: XCTestCase {
    /// The fixtures shared with src/lib/waveform.ts (WAVEFORM_FIXTURES) and core/logic/Waveform.kt's test. Dyadic
    /// values, so the result is exact on every platform.
    func testSharedFixturesGiveTheSameBarsAsTheWebAndAndroid() {
        XCTAssertEqual(Waveform.peaks([0.125, -0.25, 0.5, -1, 0, 0.0625, -0.5, 0.25], bars: 4), [0.25, 1, 0.0625, 0.5])
        XCTAssertEqual(Waveform.peaks([0.5, -0.25, 0.125], bars: 6), [0, 1, 0, 0.5, 0, 0.25])
        XCTAssertEqual(Waveform.peaks([0, 0, 0, 0], bars: 2), [0, 0])
        XCTAssertEqual(Waveform.peaks([], bars: 3), [0, 0, 0])
    }

    func testDefaultsToTheStandardBarCountWithTheTallestAtOne() {
        let samples = (0..<4800).map { Float(sin(Double($0) / 7) * (1 + Double($0 % 50) / 50)) }
        let bars = Waveform.peaks(samples)
        XCTAssertEqual(bars.count, Waveform.bars)
        XCTAssertEqual(bars.max(), 1)
        XCTAssertTrue(bars.allSatisfy { $0 >= 0 && $0 <= 1 })
    }

    func testSignAndScaleAreIgnored() {
        XCTAssertEqual(Waveform.peaks([-2, 4, -8, 1], bars: 2), Waveform.peaks([0.25, -0.5, 1, -0.125], bars: 2))
    }

    func testALouderPartIsATallerBar() {
        let samples = [Float](repeating: 0.1, count: 10) + [Float](repeating: 0.9, count: 10)
        let bars = Waveform.peaks(samples, bars: 2)
        XCTAssertLessThan(bars[0], bars[1])
    }

    func testSlowIsThreeQuartersSpeed() {
        XCTAssertEqual(Waveform.slowRate, 0.75)
    }
}
