import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum AIResponseSurface: String, CaseIterable, Sendable { case hector, conversation, campaign }

public enum AIResponseReportReason: String, CaseIterable, Sendable {
    case inappropriate = "ai_inappropriate"
    case harmful = "ai_harmful"
    case incorrect = "ai_incorrect"
    case other = "ai_other"

    public var label: String {
        switch self {
        case .inappropriate: return "Inappropriate or offensive"
        case .harmful: return "Harmful or unsafe"
        case .incorrect: return "Wrong or misleading"
        case .other: return "Something else"
        }
    }
}

/// One AI message reported by the learner. Stored in `content_reports` as kind 'ai_response' with no reported user;
/// the text goes in context.message.
public struct AIResponseReport: Sendable, Equatable {
    /// The same cap as the web (AI_REPORT_MESSAGE_MAX), counted in code points, never in the middle of an emoji.
    public static let maxMessageLength = 2500
    /// `content_reports.context` is limited to 8192 BYTES. 2500 four-byte emoji alone would exceed it, so the text is
    /// also kept under this many UTF-8 bytes, always on a code point boundary.
    static let maxMessageBytes = 6000

    public let message: String
    public let surface: AIResponseSurface
    public let course: String
    public let reason: AIResponseReportReason
    public let scenarioID: String?
    public let campaignID: String?
    public let sceneIndex: Int?

    public init(
        message: String, surface: AIResponseSurface, course: String, reason: AIResponseReportReason,
        scenarioID: String? = nil, campaignID: String? = nil, sceneIndex: Int? = nil
    ) {
        self.message = Self.capped(message)
        self.surface = surface
        self.course = course
        self.reason = reason
        self.scenarioID = scenarioID
        self.campaignID = campaignID
        self.sceneIndex = sceneIndex
    }

    static func capped(_ text: String) -> String {
        var scalars = String.UnicodeScalarView()
        var bytes = 0
        for scalar in text.unicodeScalars {
            let width = String(scalar).utf8.count
            if scalars.count >= maxMessageLength || bytes + width > maxMessageBytes { break }
            scalars.append(scalar)
            bytes += width
        }
        return String(scalars)
    }

    func jsonObject() -> [String: Any] {
        var context: [String: Any] = [
            "message": message, "surface": surface.rawValue, "course": course, "platform": "ios",
        ]
        if let scenarioID { context["scenario_id"] = scenarioID }
        if let campaignID { context["campaign_id"] = campaignID }
        if let sceneIndex { context["scene_index"] = sceneIndex }
        return ["kind": "ai_response", "reason": reason.rawValue, "context": context]
    }
}

extension ProgressSyncClient {
    /// Plain insert, same trust boundary as `reportUser`: RLS `content_reports_insert_own`.
    public func reportAIResponse(_ report: AIResponseReport) async throws {
        var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/content_reports"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: report.jsonObject())
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
    }
}
