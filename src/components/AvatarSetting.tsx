import { useEffect } from "react";
import { useAvatarPreference } from "@/lib/avatar/preference";

/** The Settings switch for "Show Alphonso while practicing" (on by default, kept on this device). */
export function AvatarSetting() {
  const enabled = useAvatarPreference((s) => s.enabled);
  const setEnabled = useAvatarPreference((s) => s.setEnabled);
  const hydrate = useAvatarPreference((s) => s.hydrate);
  useEffect(() => hydrate(), [hydrate]);

  return (
    <section aria-labelledby="avatar-setting-heading">
      <h2 id="avatar-setting-heading" className="mt-8 ds-type-headline text-ds-ink">
        Show Alphonso while practicing
      </h2>
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-ds-line bg-ds-sunk px-4 py-3">
        <span className="text-sm text-ds-ink">{enabled ? "On" : "Off"}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Show Alphonso while practicing"
          onClick={() => setEnabled(!enabled)}
          className={`relative h-7 w-12 rounded-full transition ${enabled ? "bg-ds-action" : "bg-ds-line"}`}
        >
          <span
            className={`absolute top-0.5 size-6 rounded-full bg-ds-card transition ${enabled ? "left-5" : "left-0.5"}`}
          />
        </button>
      </div>
      <p className="mt-2 text-xs text-ds-ink-soft">
        Alphonso, and Hector on his tab, fill the screen in a speaking conversation and move their
        mouths as they talk. It is only a picture: the conversation text below is the same either
        way.
      </p>
    </section>
  );
}
