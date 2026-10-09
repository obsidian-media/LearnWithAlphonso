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
    /// `content_reports.context` is checked as `octet_length(context::text) <= 8192`: the size of the JSON text, where
    /// a quote, backslash or newline costs 2 bytes, another control character 6 and an emoji 4. The message is cut so
    /// the whole context stays inside that limit, always on a code point boundary.
    static let contextByteLimit = 8192
    /// Room for the keys, braces, quotes and the spaces the database adds after colons and commas.
    static let contextStructureBytes = 400

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
        self.message = Self.capped(
            message,
            byteBudget: Self.contextByteLimit - Self.contextStructureBytes
                - Self.jsonBytes(of: course) - Self.jsonBytes(of: scenarioID ?? "")
                - Self.jsonBytes(of: campaignID ?? ""))
        self.surface = surface
        self.course = course
        self.reason = reason
        self.scenarioID = scenarioID
        self.campaignID = campaignID
        self.sceneIndex = sceneIndex
    }

    /// Bytes `text` takes inside a JSON string, which is what the database counts.
    static func jsonBytes(of text: String) -> Int {
        text.unicodeScalars.reduce(0) { $0 + jsonBytes(of: $1) }
    }

    static func jsonBytes(of scalar: Unicode.Scalar) -> Int {
        switch scalar.value {
        case 0x22, 0x5C, 0x0A, 0x0D, 0x09, 0x08, 0x0C: return 2
        case 0x00...0x1F: return 6
        default: return String(scalar).utf8.count
        }
    }

    /// The message with U+0000 removed (jsonb cannot store it; a Swift String has no lone surrogates to remove),
    /// cut to the cap and the byte budget.
    static func capped(_ text: String, byteBudget: Int) -> String {
        var scalars = String.UnicodeScalarView()
        var bytes = 0
        for scalar in text.unicodeScalars {
            if scalar.value == 0 { continue }
            let width = jsonBytes(of: scalar)
            if scalars.count >= maxMessageLength || bytes + width > byteBudget { break }
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
