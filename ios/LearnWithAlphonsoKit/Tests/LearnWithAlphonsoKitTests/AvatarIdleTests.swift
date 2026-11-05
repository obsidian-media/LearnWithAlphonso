import XCTest
@testable import LearnWithAlphonsoKit

/// Hands out the same scripted values forever (cycling).
private struct Scripted: AvatarRandomSource {
    var values: [Double]
    var index = 0
    init(_ values: [Double]) { self.values = values }
    mutating func nextUnit() -> Double {
        defer { index = (index + 1) % values.count }
        return values[index]
    }
}

final class AvatarIdleTests: XCTestCase {
    func testEarTwitchFiresAtTheMinimumIntervalLastsAbout160msThenRests() {
        var s = AvatarIdleScheduler(random: Scripted([0.0]))
        s.advance(to: 3.99)
        XCTAssertNil(s.twitchingEar)
        s.advance(to: 4.0)
        XCTAssertEqual(s.twitchingEar, .left)
        s.advance(to: 4.15)
        XCTAssertEqual(s.twitchingEar, .left)
        s.advance(to: 4.17)
        XCTAssertNil(s.twitchingEar)
    }

    func testTheSideComesFromTheRandomSource() {
        var s = AvatarIdleScheduler(random: Scripted([0.99]))
        // 0.99 of the 4-9 s range puts the first twitch at 8.95 s.
        s.advance(to: 9.0)
        XCTAssertEqual(s.twitchingEar, .right)
    }

    func testGlintSweepsOverAbout700msThenIsGone() {
        var s = AvatarIdleScheduler(random: Scripted([0.0]))
        s.advance(to: 5.99)
        XCTAssertNil(s.glintProgress)
        s.advance(to: 6.0)
        XCTAssertEqual(s.glintProgress ?? -1, 0, accuracy: 1e-9)
        s.advance(to: 6.35)
        XCTAssertEqual(s.glintProgress ?? -1, 0.5, accuracy: 1e-9)
        s.advance(to: 6.71)
        XCTAssertNil(s.glintProgress)
    }

    func testSameSeedGivesTheSameLifeAndTimingStaysInRange() {
        func run(seed: UInt64) -> (frames: [String], earStarts: [Double], glintStarts: [Double]) {
            var s = AvatarIdleScheduler(random: AvatarSeededRandom(seed: seed))
            var frames: [String] = [], ears: [Double] = [], glints: [Double] = []
            var wasEar = false, wasGlint = false
            var t = 0.0
            while t < 300 {
                s.advance(to: t)
                frames.append("\(String(describing: s.twitchingEar))|\(String(describing: s.glintProgress))")
                if s.twitchingEar != nil, !wasEar { ears.append(t) }
                if s.glintProgress != nil, !wasGlint { glints.append(t) }
                wasEar = s.twitchingEar != nil
                wasGlint = s.glintProgress != nil
                t += 0.02
            }
            return (frames, ears, glints)
        }
        let a = run(seed: 7), b = run(seed: 7), c = run(seed: 8)
        XCTAssertEqual(a.frames, b.frames)
        XCTAssertNotEqual(a.frames, c.frames)
        XCTAssertGreaterThan(a.earStarts.count, 20)
        XCTAssertGreaterThan(a.glintStarts.count, 15)
        // Starts are sampled every 20 ms, so allow that much slack around the 4-9 s and 6-12 s ranges.
        for (x, y) in zip(a.earStarts, a.earStarts.dropFirst()) {
            XCTAssertGreaterThanOrEqual(y - x, 4 - 0.04)
            XCTAssertLessThanOrEqual(y - x, 9 + 0.04)
        }
        for (x, y) in zip(a.glintStarts, a.glintStarts.dropFirst()) {
            XCTAssertGreaterThanOrEqual(y - x, 6 - 0.04)
            XCTAssertLessThanOrEqual(y - x, 12 + 0.04)
        }
    }

    func testBothEarsGetUsedOverTime() {
        var s = AvatarIdleScheduler(random: AvatarSeededRandom(seed: 1))
        var seen = Set<AvatarEarSide>()
        var t = 0.0
        while t < 300 {
            s.advance(to: t)
            if let e = s.twitchingEar { seen.insert(e) }
            t += 0.02
        }
        XCTAssertEqual(seen, [.left, .right])
    }

    func testALargeJumpInTimeCatchesUpAndTheScheduleStillRuns() {
        var s = AvatarIdleScheduler(random: Scripted([0.0]))
        s.advance(to: 100_000)
        // With every draw at 0.0 the ear fires every 4 s (so 100 000 is a start, 4 divides it).
        XCTAssertEqual(s.twitchingEar, .left)
        s.advance(to: 100_001)
        XCTAssertNil(s.twitchingEar)
    }

    func testBreathingAndSwayStayInTheirSmallRanges() {
        XCTAssertEqual(AvatarIdleMotion.breathScale(at: 0).x, 1, accuracy: 1e-9)
        XCTAssertEqual(AvatarIdleMotion.breathScale(at: 0).y, 1, accuracy: 1e-9)
        XCTAssertEqual(AvatarIdleMotion.breathScale(at: 2.1).x, 1.007, accuracy: 1e-9)
        XCTAssertEqual(AvatarIdleMotion.breathScale(at: 2.1).y, 1.011, accuracy: 1e-9)
        XCTAssertEqual(AvatarIdleMotion.swayDegrees(at: 1.75), 0.45, accuracy: 1e-9)
        var t = 0.0
        while t < 30 {
            XCTAssertLessThanOrEqual(abs(AvatarIdleMotion.swayDegrees(at: t)), 0.45 + 1e-9)
            let b = AvatarIdleMotion.breathScale(at: t)
            XCTAssertTrue((1.0...(1.007 + 1e-9)).contains(b.x))
            XCTAssertTrue((1.0...(1.011 + 1e-9)).contains(b.y))
            t += 0.1
        }
    }
}
