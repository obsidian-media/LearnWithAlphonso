import { useEffect, useRef } from "react";
import { transcriptParagraphs } from "../lib/podcast-transcript";
import type { SavedWordCourse } from "../lib/saved-word";
import { roomArt } from "./ListenLibrary";
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
  /** The episode's course: tapped words are saved under it. */
  course: SavedWordCourse;
  /** The episode's room, painted behind the sheet like the full player. */
  room?: string;
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

function TranscriptPanelBody({
  title,
  transcript,
  course,
  room = "radio",
  isLoading,
  onClose,
}: PanelProps) {
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
      className="fixed inset-0 z-40 mx-auto flex max-w-[430px] flex-col overflow-hidden bg-ds-hero text-ds-on-hero"
    >
      <div
        aria-hidden="true"
        data-transcript-room=""
        className="absolute inset-0 bg-cover bg-center blur-md"
        style={{ backgroundImage: `url(${roomArt(room)})` }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-ds-hero/80" />
      <div className="relative flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="ds-type-overline text-ds-on-hero-kick">Transcript</p>
            <p className="truncate font-display text-xl font-extrabold leading-tight">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close transcript"
            className="min-h-11 shrink-0 rounded-full bg-ds-on-hero/15 px-4 ds-type-footnote font-extrabold"
          >
            Close
          </button>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto rounded-[22px] bg-ds-card p-4 text-ds-ink shadow-[var(--ds-shadow-floating)]"
        >
          {isLoading ? (
            <p className="ds-type-footnote text-ds-ink-soft">Loading transcript…</p>
          ) : paragraphs.length === 0 ? (
            // Said plainly rather than rendered blank: an episode without a
            // transcript is inaccessible to deaf learners, and that is a fact
            // about the content, not an empty UI state to hide.
            <p className="ds-type-footnote text-ds-ink-soft">No transcript for this episode yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <SaveWordHint always />
                <button
                  type="button"
                  onClick={() =>
                    scrollRef.current?.querySelector<HTMLElement>("[data-save-word]")?.focus()
                  }
                  className="mt-1 min-h-11 ds-type-caption text-ds-choice underline underline-offset-2"
                >
                  Browse words with the keyboard
                </button>
              </div>
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="ds-type-body text-ds-ink">
                  {/* A transcript is wholly in its episode's course language, so a tapped
                      word is saved under that course. Words stay out of the tab order:
                      a transcript is hundreds of them. */}
                  <TappableText
                    text={paragraph}
                    course={course}
                    focusable={false}
                    wholeCourseLanguage
                  />
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
