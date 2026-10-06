import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import LearnWithAlphonsoKit

final class LearningGoalClientTests: XCTestCase {
    private let baseURL = URL(string: "https://english-buddy-app-33.vercel.app")!

    private let planJSON: [String: Any] = [
        "currentLevel": "A1", "targetLevel": "B1", "targetDate": "2026-12-01", "lessonsInScope": 30,
        "lessonsRemaining": 20, "lessonsDoneLast7Days": 10, "requiredPerWeek": 10, "status": "on_track",
        "realism": "ok", "suggestedDate": NSNull(), "asOf": "2026-10-06T12:00:00.000Z",
    ]
    private let goalJSON: [String: Any] = [
        "course": "en", "targetLevel": "B1", "targetDate": "2026-12-01",
        "createdAt": "2026-10-01T00:00:00.000Z",
    ]

    private func client(
        status: Int = 200, json: Any = [String: Any](), raw: Data? = nil, error: Error? = nil,
        refresh: (@Sendable () async -> String?)? = nil, capture: TestCapture<[URLRequest]>? = nil
    ) -> LearningGoalClient {
        LearningGoalClient(
            baseURL: baseURL, accessToken: { "tok" }, refreshAccessToken: refresh,
            requester: { request in
                capture?.value.append(request)
                if let error { throw error }
                let data = raw ?? (try! JSONSerialization.data(withJSONObject: json))
                return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            })
    }

    func testFetchGetsTheCourseWithTheBearerTokenAndDecodesTheState() async throws {
        let captured = TestCapture<[URLRequest]>([])
        let c = client(json: ["goal": goalJSON, "plan": planJSON], capture: captured)
        let state = try await c.fetch(course: "en")
        let request = try XCTUnwrap(captured.value.first)
        XCTAssertEqual(request.httpMethod ?? "GET", "GET")
        XCTAssertEqual(request.url?.path, "/api/learning-goal")
        XCTAssertEqual(request.url?.query, "course=en")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertEqual(state.goal?.targetLevel, "B1")
        XCTAssertEqual(state.plan?.status, .onTrack)
    }

    func testFetchWithNoGoalIsAnEmptyState() async throws {
        let c = client(json: ["goal": NSNull(), "plan": NSNull()])
        let state = try await c.fetch(course: "fr")
        XCTAssertNil(state.goal)
        XCTAssertNil(state.plan)
    }

    func testPreviewIsAGetWithTheCandidateInTheQueryAndNoBody() async throws {
        let captured = TestCapture<[URLRequest]>([])
        let c = client(json: ["plan": planJSON], capture: captured)
        let plan = try await c.preview(course: "en", targetLevel: "B1", targetDate: "2026-12-01")
        let request = try XCTUnwrap(captured.value.first)
        XCTAssertEqual(request.httpMethod ?? "GET", "GET")
        XCTAssertEqual(request.url?.query, "course=en&targetLevel=B1&targetDate=2026-12-01")
        XCTAssertNil(request.httpBody)
        XCTAssertEqual(plan.requiredPerWeek, 10)
    }

    func testSavePutsTheGoalAsJSON() async throws {
        let captured = TestCapture<[URLRequest]>([])
        let c = client(json: ["goal": goalJSON, "plan": planJSON], capture: captured)
        let state = try await c.save(course: "en", targetLevel: "B1", targetDate: "2026-12-01")
        let request = try XCTUnwrap(captured.value.first)
        XCTAssertEqual(request.httpMethod, "PUT")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let payload = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as! [String: String]
        XCTAssertEqual(payload, ["course": "en", "targetLevel": "B1", "targetDate": "2026-12-01"])
        XCTAssertNotNil(state.goal)
    }

    func testRemoveIsADeleteForTheCourse() async throws {
        let captured = TestCapture<[URLRequest]>([])
        let c = client(json: ["ok": true], capture: captured)
        try await c.remove(course: "es")
        let request = try XCTUnwrap(captured.value.first)
        XCTAssertEqual(request.httpMethod, "DELETE")
        XCTAssertEqual(request.url?.query, "course=es")
    }

    func testABadRequestCarriesTheServersReason() async {
        let c = client(status: 400, json: ["error": "That level is below yours"])
        do {
            _ = try await c.fetch(course: "en")
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? LearningGoalError, .invalid("That level is below yours"))
        }
    }

    func testABadRequestWithoutAReadableBodyHasNoDetail() async {
        let c = client(status: 400, raw: Data("nope".utf8))
        do {
            _ = try await c.fetch(course: "en")
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? LearningGoalError, .invalid(nil))
        }
    }

    func testStatusesMapToTheSameErrorsAsTheWebClient() async {
        for (status, expected) in [(401, LearningGoalError.notSignedIn), (403, .notSignedIn), (500, .unavailable), (502, .unavailable)] {
            do {
                _ = try await client(status: status, json: ["error": "x"]).fetch(course: "en")
                XCTFail("expected a throw for \(status)")
            } catch {
                XCTAssertEqual(error as? LearningGoalError, expected, "HTTP \(status)")
            }
        }
    }

    func testATransportFailureIsOfflineAndOtherFailuresAreUnavailable() async {
        do {
            _ = try await client(error: URLError(.notConnectedToInternet)).fetch(course: "en")
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? LearningGoalError, .offline)
        }
        struct Boom: Error {}
        do {
            _ = try await client(error: Boom()).fetch(course: "en")
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? LearningGoalError, .unavailable)
        }
    }

    func testAWrongShapedSuccessIsUnavailable() async {
        do {
            _ = try await client(json: ["goal": goalJSON, "plan": ["nope": 1]]).fetch(course: "en")
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? LearningGoalError, .unavailable)
        }
    }

    func testA401RefreshesOnceAndRetriesWithTheNewToken() async throws {
        let captured = TestCapture<[URLRequest]>([])
        let calls = TestCapture<Int>(0)
        let c = LearningGoalClient(
            baseURL: baseURL, accessToken: { "old" }, refreshAccessToken: { "new" },
            requester: { request in
                captured.value.append(request)
                calls.value += 1
                let ok = calls.value > 1
                let body: Any = ok ? ["goal": NSNull(), "plan": NSNull()] : ["error": "expired"]
                return (
                    try! JSONSerialization.data(withJSONObject: body),
                    HTTPURLResponse(url: request.url!, statusCode: ok ? 200 : 401, httpVersion: nil, headerFields: nil)!)
            })
        _ = try await c.fetch(course: "en")
        XCTAssertEqual(captured.value.count, 2)
        XCTAssertEqual(captured.value[0].value(forHTTPHeaderField: "Authorization"), "Bearer old")
        XCTAssertEqual(captured.value[1].value(forHTTPHeaderField: "Authorization"), "Bearer new")
    }

    func testARefreshedTokenThatIsStillRejectedIsNotSignedInWithNoFurtherRetry() async {
        let captured = TestCapture<[URLRequest]>([])
        let c = client(status: 401, json: ["error": "no"], refresh: { "new" }, capture: captured)
        do {
            _ = try await c.fetch(course: "en")
            XCTFail("expected a throw")
        } catch {
            XCTAssertEqual(error as? LearningGoalError, .notSignedIn)
        }
        XCTAssertEqual(captured.value.count, 2)
    }
}
