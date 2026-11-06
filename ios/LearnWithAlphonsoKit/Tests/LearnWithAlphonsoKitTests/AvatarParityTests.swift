import XCTest
@testable import LearnWithAlphonsoKit

/// Replays shared/avatar-parity.json: the Kit's own outputs for a set of inputs, which the TypeScript (web) and
/// Kotlin (Android) ports replay too. If this fails, the Kit changed (or the file was edited by hand); if only the
/// other ports fail, they drifted. Regenerate the file from the Kit, never from a port.
final class AvatarParityTests: XCTestCase {
    private typealias JSON = [String: Any]

    private func load() throws -> JSON {
        // .../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/AvatarParityTests.swift -> repo root
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        url.appendPathComponent("shared/avatar-parity.json")
        let data = try Data(contentsOf: url)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? JSON)
    }

    private func course(_ code: String) -> Course {
        switch code {
        case "fr": return .french
        case "es": return .spanish
        default: return .english
        }
    }

    private func assertNear(_ actual: Double?, _ expected: Double?, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
        switch (actual, expected) {
        case (nil, nil): return
        case let (a?, e?): XCTAssertEqual(a, e, accuracy: 1e-9, label, file: file, line: line)
        default: XCTFail("\(label): \(String(describing: actual)) vs \(String(describing: expected))", file: file, line: line)
        }
    }

    func testVisemeSequencesMatchTheFixtures() throws {
        let rows = try XCTUnwrap(try load()["visemes"] as? [JSON])
        XCTAssertGreaterThan(rows.count, 60)
        for row in rows {
            let word = row["word"] as! String
            let got = AvatarVisemes.sequence(for: word, course: course(row["course"] as! String)).map(\.rawValue)
            XCTAssertEqual(got, row["expect"] as! [String], "\(row["course"]!) \(word)")
        }
    }

    func testLipSyncPlansMatchTheFixtures() throws {
        let rows = try XCTUnwrap(try load()["plans"] as? [JSON])
        XCTAssertGreaterThan(rows.count, 8)
        for row in rows {
            let text = row["text"] as! String
            let plan = AvatarLipSync.plan(text: text, course: course(row["course"] as! String), duration: row["duration"] as! Double)
            let cues = row["cues"] as! [JSON]
            XCTAssertEqual(plan.cues.count, cues.count, text)
            for (cue, expected) in zip(plan.cues, cues) {
                assertNear(cue.start, expected["start"] as? Double, "\(text) cue start")
                assertNear(cue.end, expected["end"] as? Double, "\(text) cue end")
                XCTAssertEqual(cue.viseme.rawValue, expected["viseme"] as? String, text)
            }
            let spans = row["raisedBrows"] as! [JSON]
            XCTAssertEqual(plan.raisedBrows.count, spans.count, text)
            for (span, expected) in zip(plan.raisedBrows, spans) {
                assertNear(span.start, expected["start"] as? Double, "\(text) brow start")
                assertNear(span.end, expected["end"] as? Double, "\(text) brow end")
            }
            for probe in row["probes"] as! [JSON] {
                let t = probe["time"] as! Double
                XCTAssertEqual(plan.viseme(at: t).rawValue, probe["viseme"] as? String, "\(text) viseme at \(t)")
                XCTAssertEqual(plan.brows(at: t).rawValue, probe["brows"] as? String, "\(text) brows at \(t)")
            }
        }
    }

    private func phase(_ kind: String, _ generation: Int) -> VoicePhase {
        switch kind {
        case "idle": return .idle
        case "requestingPermission": return .requestingPermission(generation: generation)
        case "recording": return .recording(generation: generation)
        case "transcribing": return .transcribing(generation: generation)
        case "thinking": return .thinking(generation: generation)
        case "speaking": return .speaking(generation: generation)
        default: return .failed(.network)
        }
    }

    private func label(_ mode: AvatarMode) -> String {
        switch mode {
        case .idle: return "idle"
        case .listening: return "listening"
        case .thinking: return "thinking"
        case .speaking: return "speaking"
        case .reacting(.happy): return "reacting:happy"
        case .reacting(.encouraging): return "reacting:encouraging"
        }
    }

    func testStateMachineScenariosMatchTheFixtures() throws {
        let machine = try XCTUnwrap(try load()["machine"] as? JSON)
        let planRows = machine["plans"] as! [JSON]
        let plans = planRows.map {
            AvatarLipSync.plan(text: $0["text"] as! String, course: course($0["course"] as! String), duration: $0["duration"] as! Double)
        }
        let scenarios = machine["scenarios"] as! [JSON]
        XCTAssertGreaterThan(scenarios.count, 10)
        for scenario in scenarios {
            let name = scenario["name"] as! String
            var m = AvatarMachine()
            for (index, step) in (scenario["steps"] as! [JSON]).enumerated() {
                let where_ = "\(name) step \(index)"
                switch step["op"] as! String {
                case "update":
                    m.update(phase: phase(step["phase"] as! String, step["generation"] as! Int), now: step["now"] as! Double)
                    XCTAssertEqual(label(m.mode), step["mode"] as? String, where_)
                case "heard":
                    m.heard(levelDBFS: step["level"] as! Double, now: step["now"] as! Double)
                case "reply":
                    switch step["verdict"] as! String {
                    case "correct": m.replyArrived(verdict: .correct)
                    case "corrected": m.replyArrived(verdict: .corrected)
                    default: m.replyArrived(verdict: .inconclusive)
                    }
                case "pose":
                    var speech: AvatarSpeechPosition?
                    if let s = step["speech"] as? JSON {
                        speech = AvatarSpeechPosition(plan: plans[s["plan"] as! Int], time: s["time"] as! Double)
                    }
                    let pose = m.pose(now: step["now"] as! Double, speech: speech)
                    XCTAssertEqual(label(m.mode), step["mode"] as? String, "\(where_) mode")
                    XCTAssertEqual(pose.mouth.rawValue, step["mouth"] as? String, "\(where_) mouth")
                    XCTAssertEqual(pose.brows.rawValue, step["brows"] as? String, "\(where_) brows")
                default:
                    XCTFail("unknown op in \(where_)")
                }
            }
        }
    }

    func testIdleLifeMatchesTheFixtures() throws {
        let idle = try XCTUnwrap(try load()["idle"] as? JSON)
        for seedRow in idle["seeds"] as! [JSON] {
            let seed = UInt64(seedRow["seed"] as! String)!
            var random = AvatarSeededRandom(seed: seed)
            for (k, expected) in (seedRow["first"] as! [Double]).enumerated() {
                assertNear(random.nextUnit(), expected, "seed \(seed) random \(k)")
            }
            var scheduler = AvatarIdleScheduler(random: AvatarSeededRandom(seed: seed))
            for sample in seedRow["samples"] as! [JSON] {
                let t = sample["t"] as! Double
                scheduler.advance(to: t)
                let ear = scheduler.twitchingEar.map { $0 == .left ? "left" : "right" }
                XCTAssertEqual(ear, sample["ear"] as? String, "seed \(seed) ear at \(t)")
                assertNear(scheduler.glintProgress, sample["glint"] as? Double, "seed \(seed) glint at \(t)")
            }
            var jumped = AvatarIdleScheduler(random: AvatarSeededRandom(seed: seed))
            let jump = seedRow["jump"] as! JSON
            jumped.advance(to: jump["t"] as! Double)
            XCTAssertEqual(jumped.twitchingEar.map { $0 == .left ? "left" : "right" }, jump["ear"] as? String)
            assertNear(jumped.glintProgress, jump["glint"] as? Double, "seed \(seed) glint after a jump")
        }
        for row in idle["motion"] as! [JSON] {
            let t = row["t"] as! Double
            assertNear(AvatarIdleMotion.swayDegrees(at: t), row["sway"] as? Double, "sway \(t)")
            assertNear(AvatarIdleMotion.breathScale(at: t).x, row["breathX"] as? Double, "breath x \(t)")
            assertNear(AvatarIdleMotion.breathScale(at: t).y, row["breathY"] as? Double, "breath y \(t)")
        }
    }
}
