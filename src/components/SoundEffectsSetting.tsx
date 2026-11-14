import { SettingSwitchCard } from "@/components/ds/Blocks";
import { useSoundEffectsOn } from "@/lib/sfx";

/** The Settings switch for sound effects (on by default, kept on this device). Off is completely silent. */
export function SoundEffectsSetting() {
  const [on, setOn] = useSoundEffectsOn();
  return (
    <SettingSwitchCard
      id="sound-effects-heading"
      title="Sound effects"
      on={on}
      onChange={setOn}
      body="Short sounds for a right or wrong answer, a finished lesson and a call. They never play over Alphonso or Hector."
    />
  );
}
