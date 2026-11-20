import XCTest
@testable import LearnWithAlphonsoKit

/// Replays shared/hector-corrections.json, which the TypeScript and Kotlin ports replay too.
final class HectorCorrectionTests: XCTestCase {
    private func load() throws -> [String: Any] {
        // .../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/HectorCorrectionTests.swift -> repo root
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        url.appendPathComponent("shared/hector-corrections.json")
        let data = try Data(contentsOf: url)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testExtractMatchesTheSharedFixtures() throws {
        let cases = try XCTUnwrap(load()["extract"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(cases.count, 20)
        for c in cases {
            let name = c["name"] as! String
            let got = HectorCorrections.extract(c["raw"] as! String)
            XCTAssertEqual(got.text, c["text"] as? String, name)
            if let want = c["correction"] as? [String: Any] {
                XCTAssertEqual(got.correction, HectorCorrection(
                    slip: want["slip"] as! String, fix: want["fix"] as! String, note: want["note"] as? String), name)
            } else {
                XCTAssertNil(got.correction, name)
            }
        }
    }

    func testStreamingNeverShowsAHalfTagAtAnyChunkBoundary() throws {
        let streams = try XCTUnwrap(load()["streams"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(streams.count, 5)
        for s in streams {
            let name = s["name"] as! String
            var acc = ""
            var seen: [String] = []
            for chunk in s["chunks"] as! [String] {
                acc += chunk
                seen.append(HectorCorrections.visibleWhileStreaming(acc))
            }
            XCTAssertEqual(seen, s["visible"] as? [String], name)
            XCTAssertEqual(HectorCorrections.extract(acc).text, s["final"] as? String, name)
        }
        // Every possible prefix of every reply: no tag fragment is ever visible.
        let cases = try XCTUnwrap(load()["extract"] as? [[String: Any]])
        for c in cases {
            let raw = c["raw"] as! String
            if raw.contains("<correctional") { continue }
            var prefix = ""
            for ch in raw {
                prefix.append(ch)
                let visible = HectorCorrections.visibleWhileStreaming(prefix).lowercased()
                XCTAssertFalse(visible.contains("<correction"), c["name"] as! String)
                XCTAssertFalse(visible.contains("</correction"), c["name"] as! String)
            }
        }
    }

    func testALearnersTextIsNeverParsed() throws {
        let learner = try XCTUnwrap(load()["learner"] as? [[String: Any]])
        XCTAssertFalse(learner.isEmpty)
        for l in learner {
            let text = l["text"] as! String
            XCTAssertEqual(HectorCorrections.displayText(role: "user", content: text), l["shown"] as? String)
            XCTAssertEqual(HectorCorrections.displayText(role: "user", content: text), text)
        }
        let raw = "Hi\n<correction>{\"slip\":\"a\",\"fix\":\"b\"}</correction>"
        XCTAssertEqual(HectorCorrections.displayText(role: "assistant", content: raw), "Hi")
    }

    func testTheReplyDecodesItsCorrectionAndNeverFailsOnABadOne() throws {
        func reply(_ extra: [String: Any]) throws -> TutorReply {
            var body: [String: Any] = [
                "request_id": "r", "session_id": "s", "agent": "tutor", "reply": "Bien !", "audio_base64": "",
                "tts_model": "m", "tts_provider": "deepgram", "language": "fr", "state": "ok",
                "timings_ms": ["llm": 1, "tts": 2, "total": 3],
            ]
            body.merge(extra) { _, new in new }
            return try JSONDecoder().decode(TutorReply.self, from: JSONSerialization.data(withJSONObject: body))
        }
        XCTAssertNil(try reply([:]).correction)
        XCTAssertEqual(
            try reply(["correction": ["slip": "yo soy", "fix": "estoy", "note": "estar"]]).correction,
            HectorCorrection(slip: "yo soy", fix: "estoy", note: "estar"))
        XCTAssertNil(try reply(["correction": ["slip": "yo soy"]]).correction)
        XCTAssertNil(try reply(["correction": "nope"]).correction)
        XCTAssertNil(try reply(["correction": ["slip": "a", "fix": "A"]]).correction)
        XCTAssertNil(try reply(["correction": ["slip": "a", "fix": "b", "note": 7]]).correction?.note)
    }
}
