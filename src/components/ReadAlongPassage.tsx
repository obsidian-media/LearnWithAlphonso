import { useEffect, useRef, type ReactNode } from "react";
import type { Course } from "@/data/courses";
import { useModelSpeech } from "../lib/use-model-speech";
import { useStoryNarration } from "../lib/use-story-narration";
import { DsButton, DsCard } from "./ds/Blocks";
import { TappableText } from "./TappableText";

type Props = {
  segments: string[];
  course: string;
  /** Reported as each segment begins to play, for saved progress. */
  onSegment?: (segmentIndex: number) => void;
  /** Shown in the card's top row (a level label, a save-word hint). */
  header?: ReactNode;
};

/**
 * The read-along passage: the text in sentences, the narration voice reading them one by one with the current one
 * highlighted, and every word tappable (spoken and defined). Extracted from the v1 StoryReader so the branching
 * reader shows each node's passage with the exact same behaviour. Presentational; the caller owns the save calls.
 */
export function ReadAlongPassage({ segments, course, onSegment, header }: Props) {
  const narration = useStoryNarration(segments, course, onSegment);
  const speak = useModelSpeech(course as Course);
  const activeRef = useRef<HTMLParagraphElement | null>(null);

  const currentSegment = narration.current;
  useEffect(() => {
    if (currentSegment !== null)
      activeRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [currentSegment]);

  // A tapped word is spoken as well as defined: capture the click on its button before the dialog opens.
  const onWordTap = (event: React.MouseEvent) => {
    const button = (event.target as HTMLElement).closest("[data-save-word]");
    if (button?.textContent) void speak(button.textContent);
  };

  return (
    <DsCard data-story-text="">
      {header ? <div className="flex items-center justify-between gap-2">{header}</div> : null}
      <div lang={course} onClickCapture={onWordTap} className="grid gap-2">
        {segments.map((segment, i) => {
          const active = narration.current === i;
          return (
            <p
              key={i}
              ref={active ? activeRef : undefined}
              data-segment={i}
              aria-current={active ? "true" : undefined}
              className={`rounded-[14px] px-3 py-2 ds-type-body leading-relaxed text-ds-ink transition-colors ${
                active ? "bg-ds-choice-tint ring-2 ring-ds-choice" : ""
              }`}
            >
              <TappableText text={segment} course={course} wholeCourseLanguage focusable={false} />
            </p>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {narration.playing ? (
          <DsButton onClick={narration.stop}>Pause narration</DsButton>
        ) : (
          <DsButton onClick={() => void narration.play(0)}>Listen</DsButton>
        )}
      </div>
      {narration.failed ? (
        <p role="alert" className="ds-type-footnote text-ds-ink-soft">
          Narration isn&apos;t available right now. You can still read and tap any word.
        </p>
      ) : null}
    </DsCard>
  );
}
