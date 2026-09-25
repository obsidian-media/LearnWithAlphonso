import Foundation

/// Playback maths and URL building for the podcast library.
///
/// `clampPosition` is a **port of `clampPosition` in
/// `src/lib/podcast.functions.ts`; its tests are in
/// `src/lib/podcast.functions.test.ts`**, and `PodcastPlaybackTests` here
/// uses the same values. Nothing enforces that the two stay in step, so
/// the cross-reference is how drift becomes visible in review.
public enum PodcastPlayback {
    private static let bucket = "podcast-audio"

    /// Clamps a stored resume position onto an episode, returning 0 when
    /// the position is at or beyond the end.
    ///
    /// An episode's file can be replaced with a shorter one, and a
    /// multi-chunk TTS episode's stored `duration_seconds` can simply be
    /// wrong (the chunk-join probe is still unrun). Seeking past the end
    /// strands the player instead of restarting it, and resuming inside
    /// the final second replays a fraction and instantly ends, which looks
    /// identical to a broken player.
    ///
    /// Callers should pass the **media's** duration where they have it,
    /// not the stored value, precisely because the two can disagree.
    public static func clampPosition(_ position: Double, durationSeconds: Double) -> Double {
        guard position.isFinite, position > 0 else { return 0 }
        guard position < durationSeconds - 1 else { return 0 }
        return position
    }

    /// The public URL for an object in the podcast-audio bucket.
    ///
    /// The bucket is public-read by design (see the Phase 1 spec's Storage
    /// section), so no signed URL and no token refresh mid-playback.
    /// Returns nil for an empty path rather than producing a URL that
    /// points at the bucket root.
    public static func audioURL(supabaseURL: URL, audioPath: String) -> URL? {
        let segments = audioPath.split(separator: "/").map(String.init)
        guard !segments.isEmpty else { return nil }

        var url = supabaseURL
            .appendingPathComponent("storage")
            .appendingPathComponent("v1")
            .appendingPathComponent("object")
            .appendingPathComponent("public")
            .appendingPathComponent(bucket)
        // Appended segment by segment so a space or other reserved
        // character inside a filename is percent-encoded while the
        // separators stay separators.
        for segment in segments {
            url = url.appendingPathComponent(segment)
        }
        return url
    }
}
