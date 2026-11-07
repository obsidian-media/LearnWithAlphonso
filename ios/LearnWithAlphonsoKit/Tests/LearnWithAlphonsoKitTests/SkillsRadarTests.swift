import XCTest
@testable import LearnWithAlphonsoKit

final class SkillsRadarTests: XCTestCase {
    private let today = "2026-11-06"

    private func row(_ skill: String, _ right: Int, _ total: Int) -> ProfileSkillDay {
        ProfileSkillDay(day: "2026-11-05", skill: skill, right: right, total: total)
    }

    private func model(_ rows: [ProfileSkillDay]) -> SkillsRadar.Model {
        SkillsRadar.radarModel(ProfileMath.skillScores(rows: rows, today: today))
    }

    func testNotReadyWithNoAnswers() {
        let m = model([])
        XCTAssertFalse(m.ready)
        XCTAssertEqual(m.skills.map(\.pct), [nil, nil, nil, nil, nil])
        XCTAssertNil(m.lowest)
    }

    func testSkillUnderTheMinimumIsUnscoredAndSaysHowManyMore() {
        let m = model([row("listening", 4, SkillsRadar.minSkillAnswers - 1)])
        let s = m.skills.first { $0.skill == "listening" }!
        XCTAssertNil(s.pct)
        XCTAssertEqual(s.needed, 1)
        XCTAssertEqual(s.label, "Listening")
    }

    func testNeedsThreeScoredSkillsThenNamesTheLowest() {
        let two = model([row("listening", 9, 10), row("grammar", 4, 10)])
        XCTAssertFalse(two.ready)
        let three = model([row("listening", 9, 10), row("grammar", 4, 10), row("reading", 8, 10)])
        XCTAssertTrue(three.ready)
        XCTAssertEqual(three.lowest?.skill, "grammar")
        XCTAssertEqual(three.lowest?.pct, 40)
    }

    func testAxisZeroPointsUpAndPolygonHasOneVertexPerScoredSkill() {
        XCTAssertEqual(SkillsRadar.radarPoint(0, 5, 100, 150), SkillsRadar.Point(x: 150, y: 50))
        let m = model([row("listening", 10, 10), row("grammar", 5, 10), row("reading", 10, 10)])
        let poly = SkillsRadar.radarPolygon(m.skills, radius: 100, c: 150)
        XCTAssertEqual(poly.count, 3)
        // A 100 score sits on the rim of its axis.
        XCTAssertEqual(poly.first, SkillsRadar.Point(x: 150, y: 50))
    }

    func testGoalRingsAreDoneWhenMinutesReachTheGoal() {
        let learning = [
            ProfileLearningDay(day: "2026-11-02", lessonSeconds: 420, practiceSeconds: 240),
            ProfileLearningDay(day: "2026-11-03", lessonSeconds: 300, practiceSeconds: 0),
        ]
        let g = ProfileMath.goalRings(today: "2026-11-04", learning: learning, goalMinutes: 10)
        XCTAssertEqual(g.days.map(\.state), [.done, .missed, .today, .future, .future, .future, .future])
        XCTAssertEqual(g.days[0].minutes, 11)
        XCTAssertEqual(g.metDays, 1)
        XCTAssertEqual(ProfileMath.goalRings(today: "2026-11-04", learning: learning, goalMinutes: 15).metDays, 0)
    }

    func testLeagueWeekEndsIsShownInTheLearnersZone() {
        // Sunday ends at 23:59 UTC, which is already Monday the 9th in Auckland.
        XCTAssertEqual(ProfileMath.leagueWeekEnds(weekEnd: "2026-11-08", timeZone: "Pacific/Auckland"), "ends Mon, Nov 9")
        XCTAssertEqual(ProfileMath.leagueWeekEnds(weekEnd: "2026-11-08", timeZone: nil), "ends Sun, Nov 8")
        XCTAssertEqual(ProfileMath.leagueWeekEnds(weekEnd: "2026-11-08", timeZone: "Mars/Olympus"), "ends Sun, Nov 8")
    }
}
