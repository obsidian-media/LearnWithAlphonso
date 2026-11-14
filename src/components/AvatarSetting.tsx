import { useEffect } from "react";
import { SettingSwitchCard } from "@/components/ds/Blocks";
import { useAvatarPreference } from "@/lib/avatar/preference";

/** The Settings switch for "Show Alphonso while practicing" (on by default, kept on this device). */
export function AvatarSetting() {
  const enabled = useAvatarPreference((s) => s.enabled);
  const setEnabled = useAvatarPreference((s) => s.setEnabled);
  const hydrate = useAvatarPreference((s) => s.hydrate);
  useEffect(() => hydrate(), [hydrate]);

  return (
    <SettingSwitchCard
      id="avatar-setting-heading"
      title="Show Alphonso while practicing"
      on={enabled}
      onChange={setEnabled}
      body="Alphonso, and Hector on his tab, fill the screen in a speaking conversation and move their mouths as they talk. It is only a picture: the conversation text below is the same either way."
    />
  );
}
