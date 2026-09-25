import Foundation

/// Transcript rendering for the podcast library.
///
/// **Port of `transcriptParagraphs` in `src/lib/podcast-transcript.ts`; its
/// tests are `src/lib/podcast-transcript.test.ts`,** and
/// `PodcastTranscriptTests` here uses the same cases and values.
///
/// Only the render side is ported. `normalizeTranscript`'s validation --
/// including its rejection of SSML and HTML -- stays on the authoring side,
/// because the app only ever reads transcripts that were already validated
/// on the way in. Duplicating that rule would mean two places to keep in
/// step for no benefit.
public enum PodcastTranscript {
    /// Splits a stored transcript into paragraphs for rendering.
    ///
    /// A single newline inside a paragraph becomes a space: a hand-written
    /// file is often hard-wrapped, and rendering one paragraph per source
    /// line would shred it.
    public static func paragraphs(_ text: String) -> [String] {
        text
            .components(separatedBy: "\n\n")
            .map { paragraph in
                paragraph
                    .replacingOccurrences(of: "\n", with: " ")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }
            .filter { !$0.isEmpty }
    }
}
