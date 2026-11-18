import { useEffect, useRef } from "react";
import type { Course } from "@/data/courses";
import type { PodcastQuizResult } from "../lib/podcast-quiz.functions";
import type { Story } from "../lib/stories";
import { levelLabel } from "../lib/stories";
import { useModelSpeech } from "../lib/use-model-speech";
import { useStoryNarration } from "../lib/use-story-narration";
import { DsButton, DsCard } from "./ds/Blocks";
import { SaveWordHint, SaveWordProvider } from "./SaveWord";
import { StoryCheck } from "./StoryCheck";
import { TappableText } from "./TappableText";

type Props = {
  story: Story;
  onProgress?: (segmentIndex: number) => void;
  submitCheck: (
    answers: { questionId: string; choiceIndex: number }[],
  ) => Promise<PodcastQuizResult>;
  onChecked?: (result: PodcastQuizResult) => void;
};

/**
 * The read-along: the story's text in sentences, the narration voice reading them one by one with the current sentence
 * highlighted, every word tappable (it is spoken, and opens the same define-and-save dialog as the podcast transcript),
 * and the short check at the end. Presentational: the route supplies the story and the save calls.
 */
export function StoryReader(props: Props) {
  return (
    <SaveWordProvider>
      <ReaderBody {...props} />
    </SaveWordProvider>
  );
}

function ReaderBody({ story, onProgress, submitCheck, onChecked }: Props) {
  const narration = useStoryNarration(story.segments, story.course, onProgress);
  const speak = useModelSpeech(story.course as Course);
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

  const resumeAt = story.segmentIndex < story.segments.length ? story.segmentIndex : 0;

  return (
    <>
      <DsCard data-story-text="">
        <div className="flex items-center justify-between gap-2">
          <span className="ds-type-caption text-ds-ink-soft">{levelLabel(story.level)}</span>
          <SaveWordHint />
        </div>
        <div lang={story.course} onClickCapture={onWordTap} className="grid gap-2">
          {story.segments.map((segment, i) => {
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
                <TappableText
                  text={segment}
                  course={story.course}
                  wholeCourseLanguage
                  focusable={false}
                />
              </p>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {narration.playing ? (
            <DsButton onClick={narration.stop}>Pause narration</DsButton>
          ) : (
            <DsButton onClick={() => void narration.play(resumeAt)}>
              {resumeAt > 0 ? "Continue listening" : "Listen"}
            </DsButton>
          )}
          {resumeAt > 0 && !narration.playing ? (
            <DsButton variant="secondary" onClick={() => void narration.play(0)}>
              From the start
            </DsButton>
          ) : null}
        </div>
        {narration.failed ? (
          <p role="alert" className="ds-type-footnote text-ds-ink-soft">
            Narration isn&apos;t available right now. You can still read and tap any word.
          </p>
        ) : null}
      </DsCard>
      <StoryCheck questions={story.questions} submit={submitCheck} onSaved={onChecked} />
    </>
  );
}
