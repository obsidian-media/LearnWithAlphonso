import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Registers this device with AlphonsoCompanion's Cloud Voice backend
/// (POST {endpoint}/v1/voice/devices/enroll) -- required once per Cloud
/// Voice session before TutorConversationClient.respond() will accept
/// requests. Direct Swift port of VoiceCloudService.enrollCurrentDevice
/// (AlphonsoEcosystem/ios/AlphonsoCompanion/AlphonsoCompanion/Services/VoiceCloudService.swift),
/// which is the real, already-working reference for this exact endpoint.
public enum DeviceEnrollmentError: Error, Equatable {
    case badResponse
    case server(status: Int, message: String?)
}

public final class DeviceEnrollmentClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let enrollURL: URL
    private let requester: Requester

    /// `respondEndpoint` is the same full URL TutorConversationClient takes
    /// (`.../v1/voice/respond`) -- this derives the enroll URL from it the
    /// same way VoiceCloudService does, so callers only need to configure
    /// one Cloud Voice endpoint value.
    public init(
        respondEndpoint: URL,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        let base = respondEndpoint.absoluteString.replacingOccurrences(of: "/v1/voice/respond", with: "/v1/voice/devices/enroll")
        self.enrollURL = URL(string: base) ?? respondEndpoint
        self.requester = requester
    }

    public func enroll(deviceID: String, displayName: String, accessToken: String) async throws {
        var request = URLRequest(url: enrollURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["device_id": deviceID, "display_name": displayName])

        let (data, response) = try await requester(request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw DeviceEnrollmentError.badResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw DeviceEnrollmentError.server(status: httpResponse.statusCode, message: Self.errorMessage(from: data))
        }
    }

    private static func errorMessage(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let detail = object["detail"] as? String,
              !detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return detail
    }
}
