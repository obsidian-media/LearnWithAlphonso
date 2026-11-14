import { useEffect, useRef, useState } from "react";
import { dsButtonClass } from "@/components/ds/Blocks";
import { COURSES, type Course } from "@/data/courses";
import { useProgress } from "@/lib/progress";
import {
  DEFAULT_VOICES,
  chosenVoice,
  findVoice,
  voicePreviewPath,
  voicesForCourse,
  type VoiceCharacter,
  type VoiceGender,
} from "@/lib/voice-catalog";
import { useVoicePrefs } from "@/lib/voice-prefs";
import { Modal } from "./Modal";
import { SegmentedControl } from "./SegmentedControl";

const CHARACTER_LABEL: Record<VoiceCharacter, string> = {
  alphonso: "Alphonso's voice",
  hector: "Hector's voice",
};
const GENDER_GROUPS: { gender: VoiceGender; label: string }[] = [
  { gender: "male", label: "Male" },
  { gender: "female", label: "Female" },
];

/**
 * Settings > Voices: per course, which voice Alphonso and Hector speak with. Free for everyone (Hector's choice
 * applies when the learner has Pro). Saved on the account, so it follows the learner to the iPhone and Android apps.
 */
export function VoicesSetting() {
  const currentCourse = useProgress((s) => s.course);
  const [course, setCourse] = useState<Course>(currentCourse);
  const [picking, setPicking] = useState<VoiceCharacter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { prefs, choose } = useVoicePrefs();

  return (
    <section aria-labelledby="voices-setting-heading">
      <div className="grid gap-3 rounded-[22px] border-2 border-ds-line bg-ds-card p-3.5">
        <div className="flex items-center gap-2.5">
          <img
            src="/icons3d/studio_microphone.png"
            alt=""
            width={38}
            height={38}
            draggable={false}
          />
          <h2 id="voices-setting-heading" className="ds-type-headline min-w-0 flex-1 text-ds-ink">
            Voices
          </h2>
        </div>
        <SegmentedControl
          ariaLabel="Course for voices"
          value={course}
          onChange={setCourse}
          options={COURSES.map((c) => ({ value: c.id, label: c.label }))}
        />
        <ul className="space-y-2">
          {(["alphonso", "hector"] as const).map((character) => {
            const voice = findVoice(chosenVoice(prefs, character, course));
            return (
              <li key={character}>
                <button
                  type="button"
                  onClick={() => setPicking(character)}
                  aria-label={`${CHARACTER_LABEL[character]} in ${courseLabel(course)}: ${voice?.name ?? ""}. Change`}
                  className="flex min-h-12 w-full items-center justify-between rounded-[14px] border-2 border-b-4 border-ds-line bg-ds-card px-4 py-2.5 text-left"
                >
                  <span className="ds-type-headline text-ds-ink">{CHARACTER_LABEL[character]}</span>
                  <span className="ds-type-footnote text-ds-ink-soft">
                    {voice?.name} <span aria-hidden="true">→</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="ds-type-footnote text-ds-ink-soft">
          Choose how Alphonso and Hector sound in each course. Your choice is saved to your account.
        </p>
        {error && !picking && (
          <p role="alert" className="ds-type-caption text-ds-wrong-ink">
            {error}
          </p>
        )}
      </div>
      {picking && (
        <VoicePicker
          character={picking}
          course={course}
          selected={chosenVoice(prefs, picking, course)}
          error={error}
          onClose={() => setPicking(null)}
          onChoose={(id) => {
            setError(null);
            choose(picking, course, id).catch(() =>
              setError("Couldn't save your voice. Check your connection and try again."),
            );
          }}
        />
      )}
    </section>
  );
}

function courseLabel(course: Course): string {
  return COURSES.find((c) => c.id === course)?.label ?? course;
}

export function VoicePicker({
  character,
  course,
  selected,
  error,
  onChoose,
  onClose,
}: {
  character: VoiceCharacter;
  course: Course;
  selected: string;
  error?: string | null;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const defaultId = DEFAULT_VOICES[character][course];
  const voices = voicesForCourse(course);
  useEffect(() => () => audioRef.current?.pause(), []);

  function preview(id: string) {
    audioRef.current?.pause();
    if (playing === id) {
      setPlaying(null);
      return;
    }
    // A static clip, never a TTS call.
    const audio = new Audio(voicePreviewPath(id));
    audioRef.current = audio;
    setPlaying(id);
    audio.addEventListener("ended", () => setPlaying((p) => (p === id ? null : p)));
    void audio.play().catch(() => setPlaying(null));
  }

  const titleId = "voice-picker-title";
  return (
    <Modal
      labelledBy={titleId}
      onEscape={onClose}
      className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-t-[28px] bg-ds-surface p-5 outline-none sm:rounded-[28px]"
    >
      <div className="flex items-center justify-between">
        <h2 id={titleId} className="font-display ds-type-headline text-ds-ink">
          {CHARACTER_LABEL[character]} · {courseLabel(course)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className={dsButtonClass("secondary", { small: true })}
        >
          Done
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-ds-wrong-ink">
          {error}
        </p>
      )}
      <div className="mt-4 overflow-y-auto">
        {GENDER_GROUPS.map(({ gender, label }) => {
          const group = voices.filter((v) => v.gender === gender);
          if (group.length === 0) return null;
          return (
            <div key={gender} role="radiogroup" aria-label={`${label} voices`} className="mb-4">
              <h3 className="mb-2 ds-type-overline text-ds-xp-text">{label}</h3>
              <ul className="space-y-2">
                {group.map((v) => {
                  const isSelected = v.id === selected;
                  const isDefault = v.id === defaultId;
                  return (
                    <li
                      key={v.id}
                      className={`flex items-center gap-2 rounded-[14px] border-2 px-3 py-2 ${isSelected ? "border-ds-choice bg-ds-choice-tint" : "border-ds-line bg-ds-card"}`}
                    >
                      <button
                        type="button"
                        onClick={() => preview(v.id)}
                        aria-label={
                          playing === v.id ? `Stop ${v.name} preview` : `Play ${v.name} preview`
                        }
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-ds-card text-ds-ink"
                      >
                        <span aria-hidden="true">{playing === v.id ? "■" : "▶"}</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => onChoose(v.id)}
                        className="flex min-w-0 flex-1 items-center justify-between text-left"
                      >
                        <span className="min-w-0">
                          <span className="ds-type-headline block text-ds-ink">
                            {v.name}
                            {isDefault && (
                              <span className="ml-2 rounded-full bg-ds-line px-2 py-0.5 ds-type-caption text-ds-ink-soft">
                                Default
                              </span>
                            )}
                          </span>
                          <span className="ds-type-caption block text-ds-ink-soft">
                            {v.accent} · {v.descriptor}
                          </span>
                        </span>
                        {isSelected && (
                          <span aria-hidden="true" className="text-ds-choice">
                            ✓
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
