import Foundation

/// Why a download did not land.
public enum PodcastDownloadFailure: Error, Equatable, Sendable {
    /// Would exceed the downloads budget. Carries what could be removed; nothing is
    /// deleted without the learner choosing.
    case budgetExceeded(candidates: [PodcastCacheEntry], neededBytes: Int)
    case noSpace
    case offline
    case network
    case notFound
    case server(status: Int)
    case invalidContent(contentType: String?)
    case incomplete(expected: Int?, actual: Int)
}

/// Every check a finished transfer must pass before it may become a downloaded episode.
public enum PodcastDownloadValidation {
    /// 16 kbps. Episodes are ~64 kbps, so anything under a quarter of that for its
    /// duration is not the episode.
    public static let minimumBytesPerSecond = 2_000

    /// Status and type, checked before the body is kept at all. Supabase Storage answers a
    /// missing public object with HTTP 400 and a JSON body (probed 2026-10-07); that body
    /// used to be saved as `<id>.mp3`.
    public static func checkResponse(statusCode: Int, contentType: String?) -> PodcastDownloadFailure? {
        switch statusCode {
        case 200:
            break
        case 400, 403, 404, 410:
            return .notFound
        default:
            return .server(status: statusCode)
        }
        let mediaType = contentType?
            .split(separator: ";").first?
            .trimmingCharacters(in: .whitespaces)
            .lowercased()
        guard let mediaType, mediaType.hasPrefix("audio/") else {
            return .invalidContent(contentType: contentType)
        }
        return nil
    }

    /// The body's real size against what the server declared, or, when it declared
    /// nothing, against a floor derived from the episode's duration.
    public static func checkBody(expectedLength: Int?, actualBytes: Int, durationSeconds: Int) -> PodcastDownloadFailure? {
        guard actualBytes > 0 else { return .incomplete(expected: expectedLength, actual: actualBytes) }
        if let expectedLength {
            return expectedLength == actualBytes ? nil : .incomplete(expected: expectedLength, actual: actualBytes)
        }
        let floor = max(durationSeconds, 1) * minimumBytesPerSecond
        return actualBytes >= floor ? nil : .incomplete(expected: nil, actual: actualBytes)
    }

    /// A thrown error, by its whole underlying chain.
    public static func classify(_ chain: [PodcastErrorCode]) -> PodcastDownloadFailure {
        let outOfSpace = chain.contains { link in
            (link.domain == "NSCocoaErrorDomain" && link.code == 640)        // NSFileWriteOutOfSpaceError
                || (link.domain == "NSPOSIXErrorDomain" && link.code == 28)  // ENOSPC
                || (link.domain == "NSURLErrorDomain" && link.code == -3003) // cannot write the temp file
        }
        if outOfSpace { return .noSpace }
        if chain.contains(where: { $0.domain == "NSURLErrorDomain" && PodcastErrorCode.offlineURLCodes.contains($0.code) }) {
            return .offline
        }
        return .network
    }
}

public enum PodcastDownloadCopy {
    public static func title(for failure: PodcastDownloadFailure) -> String {
        switch failure {
        case .budgetExceeded: return "Not enough space set aside"
        case .noSpace: return "Not enough storage"
        case .offline: return "You're offline"
        case .network, .incomplete: return "Download interrupted"
        case .notFound: return "Episode unavailable"
        case .server, .invalidContent: return "Server problem"
        }
    }

    public static func message(for failure: PodcastDownloadFailure) -> String {
        switch failure {
        case let .budgetExceeded(candidates, _):
            guard !candidates.isEmpty else {
                return "This episode is larger than the space set aside for downloads."
            }
            // Names what to remove; removes nothing.
            return "Remove \(candidates.count) downloaded episode\(candidates.count == 1 ? "" : "s") "
                + "to make room, starting with the ones you haven't played."
        case .noSpace:
            return "Your iPhone is out of storage. Free up some space, then try the download again."
        case .offline:
            return "Connect to the internet to download this episode."
        case .network, .incomplete:
            return "The connection dropped before the episode finished downloading. Try again."
        case .notFound:
            return "This episode isn't available to download right now."
        case .server, .invalidContent:
            return "Our server didn't send the episode correctly. Try again in a moment."
        }
    }
}
