import { transcriptParagraphs } from "../lib/podcast-transcript";

/**
 * An episode's transcript, shown over the app while it plays.
 *
 * This is the accessibility artefact for the podcast library. The `<audio>`
 * element carries no captions -- timed cues need forced alignment against
 * the audio, a separate problem -- so text on screen is what makes an
 * episode available to deaf and hard-of-hearing learners at all.
 *
 * Presentational and pure so its states can be tested without a server.
 */
export function PodcastTranscriptPanel({
  title,
  transcript,
  isLoading,
  onClose,
}: {
  title: string;
  transcript: string | null;
  isLoading: boolean;
  onClose: () => void;
}) {
  const paragraphs = transcript ? transcriptParagraphs(transcript) : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Transcript: ${title}`}
      className="fixed inset-0 z-40 flex flex-col bg-surface"
    >
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft/60">
            Transcript
          </p>
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close transcript"
          className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <p className="text-sm text-ink-soft/70">Loading transcript…</p>
        ) : paragraphs.length === 0 ? (
          // Said plainly rather than rendered blank: an episode without a
          // transcript is inaccessible to deaf learners, and that is a fact
          // about the content, not an empty UI state to hide.
          <p className="text-sm text-ink-soft/70">No transcript for this episode yet.</p>
        ) : (
          <div className="space-y-3">
            {paragraphs.map((paragraph, index) => (
              <p key={index} className="text-sm leading-relaxed text-ink">
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
