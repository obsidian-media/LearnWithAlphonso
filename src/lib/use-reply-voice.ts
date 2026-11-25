import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "./analytics";
import { cancelSpeech, speakWithCallbacks } from "./speech";
import { voicePlayback } from "./voice-playback";
import { createReplyVoice, type Reply, type ReplyVoiceState } from "./voice-reply";
import { localeForCourse, type Course } from "@/data/course-meta";

/**
 * The spoken replies of a call (Hector, Practice, campaigns): a thin React wrapper over `createReplyVoice`, on the app's
 * one persistent audio element. `say` plays a reply (falling back to the device voice and a "Tap to hear" button),
 * `replay` is that button, `skip` marks the reply as heard or skipped, and the screen's own leaving stops it.
 */
export function useReplyVoice(surface: string, course: Course) {
  const [state, setState] = useState<ReplyVoiceState>({ speaking: false, awaitingTap: false });
  const controller = useMemo(
    () =>
      createReplyVoice({
        playback: voicePlayback(),
        speakDevice: speakWithCallbacks,
        cancelDevice: cancelSpeech,
        report: ({ surface: s, reason, errorName }) => {
          void track("voice_playback_failed", { surface: s, reason, error_kind: errorName });
        },
        onChange: setState,
        surface,
      }),
    [surface],
  );
  const courseRef = useRef(course);
  courseRef.current = course;

  const say = useCallback(
    (text: string, clip: Blob | null, parts?: Reply["parts"]) =>
      controller.say({ text, lang: localeForCourse(courseRef.current), clip, parts }),
    [controller],
  );

  // Leaving the screen stops the voice (and releases a waiting hands-free loop with it).
  useEffect(() => () => controller.skip(), [controller]);

  return {
    speaking: state.speaking,
    awaitingTap: state.awaitingTap,
    say,
    replay: controller.replay,
    skip: controller.skip,
  };
}
