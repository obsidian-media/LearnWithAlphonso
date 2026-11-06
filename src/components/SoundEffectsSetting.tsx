import { useSoundEffectsOn } from "@/lib/sfx";

/** The Settings switch for sound effects (on by default, kept on this device). Off is completely silent. */
export function SoundEffectsSetting() {
  const [on, setOn] = useSoundEffectsOn();
  return (
    <section aria-labelledby="sound-effects-heading">
      <h2 id="sound-effects-heading" className="mt-8 font-display ds-type-headline text-ds-ink">
        Sound effects
      </h2>
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-hairline bg-parchment px-4 py-3">
        <span className="ds-type-body text-ds-ink">{on ? "On" : "Off"}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Sound effects"
          onClick={() => setOn(!on)}
          className={`relative h-7 w-12 rounded-full transition ${on ? "bg-moss" : "bg-hairline"}`}
        >
          <span
            className={`absolute top-0.5 size-6 rounded-full bg-surface transition ${on ? "left-5" : "left-0.5"}`}
          />
        </button>
      </div>
      <p className="mt-2 ds-type-footnote text-ds-ink-soft">
        Short sounds for a right or wrong answer, a finished lesson and a call. They never play over
        Alphonso or Hector.
      </p>
    </section>
  );
}
