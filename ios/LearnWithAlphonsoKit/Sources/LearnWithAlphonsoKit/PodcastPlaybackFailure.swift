import Foundation

/// One link of an error's `NSUnderlyingErrorKey` chain, reduced to what classification
/// needs. Domains are compared as strings so this compiles without AVFoundation (the Kit
/// is tested on Windows).
public struct PodcastErrorCode: Equatable, Sendable {
    public let domain: String
    public let code: Int

    public init(domain: String, code: Int) {
        self.domain = domain
        self.code = code
    }

    /// No connection at all: not connected, cellular data off for this app, roaming off.
    public static let offlineURLCodes: Set<Int> = [-1009, -1020, -1018]
    /// A connection exists but the transfer failed: timeout, host lookup or connect
    /// failure, dropped connection, TLS failure.
    public static let networkURLCodes: Set<Int> = [-1001, -1003, -1004, -1005, -1006, -1200]

    /// The error and each underlying error beneath it, outermost first, at most 8 deep.
    public static func chain(from error: Error?) -> [PodcastErrorCode] {
        var result: [PodcastErrorCode] = []
        var current: NSError? = error.map { $0 as NSError }
        while let nsError = current, result.count < 8 {
            result.append(PodcastErrorCode(domain: nsError.domain, code: nsError.code))
            current = nsError.userInfo[NSUnderlyingErrorKey] as? NSError
        }
        return result
    }
}

/// What a HEAD request against the episode URL said, run only after a remote item fails.
public enum PodcastProbeResult: Equatable, Sendable {
    case notRun
    case noResponse
    case status(Int)
}

/// Why an episode is not playing, in terms the learner can act on.
public enum PodcastPlaybackFailure: Equatable, Sendable {
    /// Streaming needed a connection that is not there, and there is no download.
    case offlineNotDownloaded
    case network
    /// The object is gone or not readable. Supabase Storage says 400 for a missing public
    /// object (probed 2026-10-07), so 400 counts here.
    case notFound
    case server
    case unplayable

    private static let urlDomain = "NSURLErrorDomain"

    public static func classify(
        chain: [PodcastErrorCode],
        probe: PodcastProbeResult,
        isLocalFile: Bool
    ) -> PodcastPlaybackFailure {
        // A downloaded file needs no network; if it fails, the file is the problem.
        if isLocalFile { return .unplayable }

        if case let .status(status) = probe {
            if [400, 403, 404, 410].contains(status) { return .notFound }
            if (500...599).contains(status) { return .server }
        }
        if chain.contains(where: { $0.domain == urlDomain && PodcastErrorCode.offlineURLCodes.contains($0.code) }) {
            return .offlineNotDownloaded
        }
        if chain.contains(where: { $0.domain == urlDomain && PodcastErrorCode.networkURLCodes.contains($0.code) }) {
            return .network
        }
        // CoreMedia's code for an HTTP 404 while streaming. The probe is authoritative; this
        // only gives the right message before the probe answers.
        if chain.contains(where: { $0.domain == "CoreMediaErrorDomain" && $0.code == -12938 }) {
            return .notFound
        }
        if probe == .noResponse { return .network }
        return .unplayable
    }
}

public enum PodcastPlaybackCopy {
    public static let retryTitle = "Retry"
    public static let bufferingLabel = "Buffering…"

    public static func message(for failure: PodcastPlaybackFailure) -> String {
        switch failure {
        case .offlineNotDownloaded:
            return "Download this episode to listen offline."
        case .network:
            return Copy.connectionFailure
        case .notFound:
            return "This episode isn't available right now."
        case .server:
            return "The episode couldn't load because of a problem on our side. Try again in a moment."
        case .unplayable:
            return "This episode couldn't be played. Try again."
        }
    }
}
