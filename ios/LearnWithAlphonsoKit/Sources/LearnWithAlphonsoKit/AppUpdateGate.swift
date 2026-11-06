import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The "Please update" gate. The server (`GET /api/app-config`, src/lib/app-update-gate.ts) names the lowest iOS
/// build it still supports; a build below it shows `UpdateRequiredView` instead of the app.
///
/// Off by default (no minimum set). Anything that goes wrong (offline, a timeout, an unreadable answer, an unknown
/// build number) opens the app normally: a server problem must never lock anyone out. Keep in step with the web and
/// Android copies.
public enum AppUpdateGate {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    public struct Requirement: Sendable, Equatable {
        public let storeURL: URL?
        public init(storeURL: URL?) { self.storeURL = storeURL }
    }

    /// True only for a known build strictly below a set minimum.
    public static func needsUpdate(currentBuild: Int?, minBuild: Int?) -> Bool {
        guard let currentBuild, let minBuild, minBuild > 0 else { return false }
        return currentBuild < minBuild
    }

    /// The build number from CFBundleVersion ("58"), or nil when it is not a whole number.
    public static func build(fromBundleVersion value: String?) -> Int? {
        guard let value = value?.trimmingCharacters(in: .whitespaces), !value.isEmpty,
              value.allSatisfy(\.isNumber) else { return nil }
        return Int(value)
    }

    /// What the server's answer means for this build: a requirement to update, or nil (open the app).
    public static func requirement(from data: Data, currentBuild: Int?) -> Requirement? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let ios = object["ios"] as? [String: Any] else { return nil }
        let minBuild = (ios["minBuild"] as? NSNumber).flatMap { n -> Int? in
            let d = n.doubleValue
            return d.rounded() == d && d > 0 && d < Double(Int.max) ? Int(d) : nil
        }
        guard needsUpdate(currentBuild: currentBuild, minBuild: minBuild) else { return nil }
        let store = (ios["storeUrl"] as? String).flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil }
        return Requirement(storeURL: store)
    }

    /// Asks the server. Never throws: any failure is nil (open the app).
    public static func check(
        baseURL: URL,
        currentBuild: Int?,
        timeout: TimeInterval = 5,
        requester: Requester = { try await URLSession.shared.data(for: $0) }
    ) async -> Requirement? {
        guard currentBuild != nil else { return nil }
        var request = URLRequest(url: baseURL.appendingPathComponent("api/app-config"))
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, response) = try? await requester(request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return requirement(from: data, currentBuild: currentBuild)
    }
}
