import { Fragment, memo } from "react";
import type { SavedWordCourse } from "../lib/saved-word";
import { allowsSaving } from "../lib/saved-word-client";
import { isSavableWord, saveRequestFor, segmentText } from "../lib/word-segmenter";
import { useSaveWord } from "./SaveWord";

/**
 * Text whose words open the save dialog. Plain text when there is no
 * `SaveWordProvider` above it or the course does not allow saving, so a screen
 * can use it unconditionally.
 *
 * `focusable={false}` takes the words out of the tab order, for long text (a
 * transcript) where hundreds of tab stops would bury the page's real controls;
 * they remain clickable and in the accessibility tree.
 */
export const TappableText = memo(function TappableText({
  text,
  course,
  focusable = true,
}: {
  text: string;
  course: string;
  focusable?: boolean;
}) {
  const open = useSaveWord();
  if (!open || !allowsSaving(course)) return <>{text}</>;

  return (
    <>
      {segmentText(text).map((segment) =>
        segment.isWord && isSavableWord(segment.text) ? (
          <button
            key={segment.start}
            type="button"
            tabIndex={focusable ? undefined : -1}
            onClick={(event) =>
              open(saveRequestFor(text, segment, course as SavedWordCourse), event.currentTarget)
            }
            className="inline cursor-pointer appearance-none rounded-sm border-0 bg-transparent p-0 text-left font-[inherit] text-[length:inherit] leading-[inherit] text-inherit underline-offset-2 hover:underline hover:decoration-dotted focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/60"
          >
            {segment.text}
          </button>
        ) : (
          <Fragment key={segment.start}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
});
