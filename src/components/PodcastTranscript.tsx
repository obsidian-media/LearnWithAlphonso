import { useEffect, useRef } from "react";
import { transcriptParagraphs } from "../lib/podcast-transcript";
import { SaveWordHint, SaveWordProvider } from "./SaveWord";
import { TappableText } from "./TappableText";

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
type PanelProps = {
  title: string;
  transcript: string | null;
  isLoading: boolean;
  onClose: () => void;
};

/** The panel plus its own save dialog: tapping a word in the transcript offers to save it. */
export function PodcastTranscriptPanel(props: PanelProps) {
  return (
    <SaveWordProvider>
      <TranscriptPanelBody {...props} />
    </SaveWordProvider>
  );
}

function TranscriptPanelBody({ title, transcript, isLoading, onClose }: PanelProps) {
  const paragraphs = transcript ? transcriptParagraphs(transcript) : [];
  const scrollRef = useRef<HTMLDivElement>(null);

  // Words are out of the tab order (hundreds of tab stops would bury the panel's
  // real controls), so the keyboard path is: one button moves focus to the first
  // word, then the arrow keys walk the words and Enter saves the focused one. A
  // native listener, not a React prop: the container is not itself interactive.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (!target.hasAttribute("data-save-word")) return;
      const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
      const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
      if (!forward && !backward) return;
      const words = Array.from(container.querySelectorAll<HTMLElement>("[data-save-word]"));
      const next = words[words.indexOf(target) + (forward ? 1 : -1)];
      event.preventDefault();
      next?.focus();
      next?.scrollIntoView?.({ block: "nearest" });
    };
    container.addEventListener("keydown", onKey);
    return () => container.removeEventListener("keydown", onKey);
  }, [paragraphs.length]);

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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <p className="text-sm text-ink-soft/70">Loading transcript…</p>
        ) : paragraphs.length === 0 ? (
          // Said plainly rather than rendered blank: an episode without a
          // transcript is inaccessible to deaf learners, and that is a fact
          // about the content, not an empty UI state to hide.
          <p className="text-sm text-ink-soft/70">No transcript for this episode yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <SaveWordHint always />
              <button
                type="button"
                onClick={() =>
                  scrollRef.current?.querySelector<HTMLElement>("[data-save-word]")?.focus()
                }
                className="mt-1 text-xs font-medium text-moss underline underline-offset-2"
              >
                Browse words with the keyboard
              </button>
            </div>
            {paragraphs.map((paragraph, index) => (
              <p key={index} className="text-sm leading-relaxed text-ink">
                {/* Episodes are English (the podcast tables carry no language column).
                    Words stay out of the tab order: a transcript is hundreds of them. */}
                <TappableText text={paragraph} course="en" focusable={false} />
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
