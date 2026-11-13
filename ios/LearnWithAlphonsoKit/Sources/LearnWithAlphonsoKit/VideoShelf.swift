import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The practice item a video points at (`videos.practice_kind` / `practice_id`): a lesson, a Talk scenario or a story campaign.
public struct VideoPractice: Equatable, Sendable {
    public let kind: String
    public let id: String

    public init(kind: String, id: String) {
        self.kind = kind
        self.id = id
    }
}

/// One Alphonso video as the Watch shelf draws it, with this learner's progress. Mirrors the web's LibraryVideo
/// (src/lib/video-library.ts) and Android's LibraryVideo.
public struct LibraryVideo: Equatable, Sendable, Identifiable {
    public let id: String
    public let slug: String
    public let course: String
    public let title: String
    public let description: String?
    public let level: String?
    public let durationSeconds: Int
    public let videoURL: URL
    public let posterURL: URL?
    /// WebVTT. Always present on a published video (the database refuses to publish without it).
    public let captionsURL: URL
    public let tags: [String]
    public let practice: VideoPractice?
    public let sortOrder: Int
    public let progressSeconds: Int
    public let completedAt: String?

    public init(
        id: String, slug: String, course: String, title: String, description: String? = nil, level: String? = nil,
        durationSeconds: Int, videoURL: URL, posterURL: URL? = nil, captionsURL: URL, tags: [String] = [],
        practice: VideoPractice? = nil, sortOrder: Int = 0, progressSeconds: Int = 0, completedAt: String? = nil
    ) {
        self.id = id
        self.slug = slug
        self.course = course
        self.title = title
        self.description = description
        self.level = level
        self.durationSeconds = durationSeconds
        self.videoURL = videoURL
        self.posterURL = posterURL
        self.captionsURL = captionsURL
        self.tags = tags
        self.practice = practice
        self.sortOrder = sortOrder
        self.progressSeconds = progressSeconds
        self.completedAt = completedAt
    }
}

public enum VideoState: Equatable, Sendable { case new, inProgress, done }

/// The Watch shelf's rules (state, resume, speeds, the practice link), pure so they are tested. Same thresholds as the
/// web and Android.
public enum VideoShelf {
    /// Captions are ON when a video opens (accessibility, and viewing with the sound off).
    public static let captionsDefaultOn = true
    /// A restart is offered instead of a resume inside the last stretch of a video.
    public static let resumeEndGuardSeconds = 3
    public static let speeds: [Double] = [0.75, 1, 1.25, 1.5]
    /// Progress is saved at most this often while playing (and on pause, close and end).
    public static let saveEverySeconds = 5.0
    public static let bucket = "videos"

    public static func state(_ video: LibraryVideo) -> VideoState {
        if video.completedAt != nil { return .done }
        return video.progressSeconds > 0 ? .inProgress : .new
    }

    /// 0...1 watched. A finished video is 1 whatever its last position says.
    public static func fraction(_ video: LibraryVideo) -> Double {
        if video.completedAt != nil { return 1 }
        if video.durationSeconds <= 0 { return 0 }
        return min(1, max(0, Double(video.progressSeconds) / Double(video.durationSeconds)))
    }

    /// Where playback starts: the saved position, or 0 for a finished video, a new one, or one saved at its very end.
    public static func resumeSeconds(_ video: LibraryVideo) -> Int {
        if video.completedAt != nil || video.progressSeconds <= 0 { return 0 }
        if video.progressSeconds >= video.durationSeconds - resumeEndGuardSeconds { return 0 }
        return video.progressSeconds
    }

    /// The Watch shelf for one course, in shelf order. Empty means the shelf is NOT drawn (no empty box).
    public static func shelf(_ videos: [LibraryVideo], course: String) -> [LibraryVideo] {
        videos.filter { $0.course == course }.sorted {
            $0.sortOrder != $1.sortOrder ? $0.sortOrder < $1.sortOrder : $0.title < $1.title
        }
    }

    /// The next speed in the cycle; an unknown current speed restarts at normal speed.
    public static func nextSpeed(after current: Double) -> Double {
        guard let index = speeds.firstIndex(of: current) else { return 1 }
        return speeds[(index + 1) % speeds.count]
    }

    public static func speedLabel(_ speed: Double) -> String {
        speed == speed.rounded() ? "\(Int(speed))x" : "\(speed)x"
    }

    /// 49 -> "0:49", 372.4 -> "6:12". Negative and non-finite values read as 0:00.
    public static func clock(_ seconds: Double) -> String {
        let total = seconds.isFinite ? max(0, Int(seconds.rounded())) : 0
        let secondsPart = total % 60
        return String(total / 60) + ":" + (secondsPart < 10 ? "0" : "") + String(secondsPart)
    }

    /// Where the one-tap "practice this" after a video goes, or nil when the video names no practice (or a kind this app
    /// does not know).
    public static func practiceDestination(_ practice: VideoPractice?) -> PathDestination? {
        guard let practice, !practice.id.isEmpty else { return nil }
        switch practice.kind {
        case "lesson": return .lesson(practice.id)
        case "talk": return .talk(practice.id)
        case "campaign": return .campaign(practice.id, scene: 0)
        default: return nil
        }
    }

    public static func practiceLabel(_ practice: VideoPractice) -> String {
        switch practice.kind {
        case "lesson": return "Practice this in a lesson"
        case "talk": return "Practice this with Alphonso"
        default: return "Practice this in a story"
        }
    }

    /// The public URL of an object in the `videos` bucket, or nil for an empty path. Segment by segment, so a space in a
    /// file name is encoded while the separators stay separators.
    public static func publicURL(supabaseURL: URL, path: String) -> URL? {
        let segments = path.split(separator: "/").map(String.init)
        guard !segments.isEmpty else { return nil }
        var url = supabaseURL
            .appendingPathComponent("storage")
            .appendingPathComponent("v1")
            .appendingPathComponent("object")
            .appendingPathComponent("public")
            .appendingPathComponent(bucket)
        for segment in segments { url = url.appendingPathComponent(segment) }
        return url
    }

    /// One `videos` row plus the learner's watch row as the shelf shows them. A row the app cannot play (an unknown course,
    /// no captions, no video path) is dropped: showing it would break the captions-on promise.
    static func video(row: [String: Any], watch: (progress: Int, completedAt: String?)?, supabaseURL: URL) -> LibraryVideo? {
        guard let id = row["id"] as? String,
              let slug = row["slug"] as? String,
              let course = row["course"] as? String, ["en", "fr", "es"].contains(course),
              let title = row["title"] as? String,
              let duration = row["duration_seconds"] as? Int, duration > 0,
              let videoPath = row["video_path"] as? String,
              let videoURL = publicURL(supabaseURL: supabaseURL, path: videoPath),
              let captionsPath = row["captions_path"] as? String,
              let captionsURL = publicURL(supabaseURL: supabaseURL, path: captionsPath)
        else { return nil }
        var practice: VideoPractice?
        if let kind = row["practice_kind"] as? String, let practiceID = row["practice_id"] as? String,
           ["lesson", "talk", "campaign"].contains(kind), !practiceID.isEmpty {
            practice = VideoPractice(kind: kind, id: practiceID)
        }
        return LibraryVideo(
            id: id, slug: slug, course: course, title: title,
            description: row["description"] as? String,
            level: row["level_id"] as? String,
            durationSeconds: duration,
            videoURL: videoURL,
            posterURL: (row["poster_path"] as? String).flatMap { publicURL(supabaseURL: supabaseURL, path: $0) },
            captionsURL: captionsURL,
            tags: row["tags"] as? [String] ?? [],
            practice: practice,
            sortOrder: row["sort_order"] as? Int ?? 0,
            progressSeconds: watch?.progress ?? 0,
            completedAt: watch?.completedAt
        )
    }

    /// Builds the shelf's rows from the two PostgREST answers. Pure, so the mapping is tested without a network.
    public static func videos(
        videoRows: [[String: Any]], watchRows: [[String: Any]], supabaseURL: URL
    ) -> [LibraryVideo] {
        var watches: [String: (progress: Int, completedAt: String?)] = [:]
        for row in watchRows {
            guard let id = row["video_id"] as? String else { continue }
            watches[id] = (row["progress_seconds"] as? Int ?? 0, row["completed_at"] as? String)
        }
        return videoRows.compactMap { video(row: $0, watch: watches[$0["id"] as? String ?? ""], supabaseURL: supabaseURL) }
    }
}

extension PodcastClient {
    /// Every published video with this learner's progress (the `videos` and `video_watches` tables; RLS limits both).
    /// A failed progress read must not fail the shelf: the videos still play, they just show as new.
    public func fetchVideos() async throws -> [LibraryVideo] {
        let videoRequest = request(
            path: "rest/v1/videos",
            query: "select=id,slug,course,title,description,level_id,duration_seconds,video_path,poster_path,captions_path,tags,practice_kind,practice_id,sort_order&order=sort_order.asc",
            method: "GET"
        )
        let (videoData, videoResponse) = try await requester(videoRequest)
        try Self.requireSuccess(response: videoResponse)
        let videoRows = try Self.rows(from: videoData)

        var watchRows: [[String: Any]] = []
        if !videoRows.isEmpty {
            let watchRequest = request(
                path: "rest/v1/video_watches",
                query: "select=video_id,progress_seconds,completed_at",
                method: "GET"
            )
            if let (watchData, watchResponse) = try? await requester(watchRequest),
               (try? Self.requireSuccess(response: watchResponse)) != nil,
               let rows = try? Self.rows(from: watchData) {
                watchRows = rows
            }
        }
        return VideoShelf.videos(videoRows: videoRows, watchRows: watchRows, supabaseURL: supabaseURL)
    }

    /// Saves progress through `save_video_progress`, which takes the user from `auth.uid()`, requires a published video
    /// and clamps the position into the video. The end of the video completes it. There is no direct write grant.
    public func saveVideoProgress(videoID: String, progressSeconds: Int) async throws {
        var request = request(path: "rest/v1/rpc/save_video_progress", method: "POST")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "p_video_id": videoID,
            "p_progress_s": min(max(0, progressSeconds), 2_000_000_000),
        ])
        let (_, response) = try await requester(request)
        try Self.requireSuccess(response: response)
    }

    /// The video's captions file as text, for `WebVTT.parse`. Nil when it cannot be read: the player then plays without
    /// drawn captions and says so, rather than failing the video.
    public func fetchCaptions(url: URL) async -> String? {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        guard let (data, response) = try? await requester(request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode)
        else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
