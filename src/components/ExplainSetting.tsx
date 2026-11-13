import { useId, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  EXPLAIN_DAILY_LIMIT,
  EXPLAIN_MODES,
  explainLanguageName,
  type ExplainMode,
} from "@/lib/explain";
import { announceExplainSettingsChanged, useExplainSettings } from "@/lib/explain-settings";
import { NATIVE_LANGUAGES } from "@/lib/learner-profile";
import { saveLearnerProfile } from "@/lib/learner-profile.functions";

const PANEL = "mt-3 rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card p-4";

/** The three choices, in the mock's words. `tap` is the default: invisible until wanted, costs nothing until tapped. */
const OPTIONS: Record<ExplainMode, { title: string; body: (language: string) => string }> = {
  tap: {
    title: "Tap to explain",
    body: (l) =>
      `A small "Explain in ${l}" button appears when you are stuck. Nothing is translated until you tap.`,
  },
  always: {
    title: "Always show",
    body: (l) =>
      `Mistakes and new words show the ${l} explanation straight away. Good for the first weeks. Uses your daily explanation allowance faster.`,
  },
  off: {
    title: "Target language only",
    body: () =>
      "No translated help anywhere. Alphonso keeps everything in the language you are learning.",
  },
};

/**
 * Settings > Explain in my language (round 8). Which language the explanations come in (what first run guessed, and
 * changeable here) and how they appear. Saved on the account in `user_metadata.learner_profile`, next to the first-run
 * answers, so it follows the learner to the iPhone and Android apps. No table, no migration.
 */
export function ExplainSetting() {
  const settings = useExplainSettings();
  const groupId = useId();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const languages = useMemo(
    () =>
      NATIVE_LANGUAGES.map((code) => ({ code, name: explainLanguageName(code) })).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [],
  );

  async function save(patch: {
    explainMode?: ExplainMode;
    nativeLanguage?: (typeof NATIVE_LANGUAGES)[number];
  }) {
    setSaving(true);
    setError(null);
    try {
      await saveLearnerProfile({ data: { patch } });
      // The session carries the metadata the screens read; refresh it so they see the change now.
      await supabase.auth.refreshSession();
      announceExplainSettingsChanged();
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return null;
  const language = settings.nativeLanguage
    ? explainLanguageName(settings.nativeLanguage)
    : "your language";

  return (
    <section aria-labelledby="explain-setting-heading">
      <h2 id="explain-setting-heading" className="mt-8 ds-type-title text-ds-ink">
        Explain in my language
      </h2>
      <div className={PANEL}>
        <label htmlFor={`${groupId}-lang`} className="block ds-type-overline text-ds-ink-soft">
          My language
        </label>
        <div className="mt-1 flex items-center gap-2">
          <select
            id={`${groupId}-lang`}
            value={settings.nativeLanguage ?? ""}
            disabled={saving}
            onChange={(e) =>
              void save({ nativeLanguage: e.target.value as (typeof NATIVE_LANGUAGES)[number] })
            }
            className="min-h-11 flex-1 rounded-[var(--ds-radius-key)] border-2 border-ds-line bg-ds-surface px-3 ds-type-body text-ds-ink"
          >
            {!settings.nativeLanguage && <option value="">Choose a language</option>}
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 ds-type-caption text-ds-ink-soft">From your first-run answers.</p>

        <div role="radiogroup" aria-label="How explanations appear" className="mt-3 grid gap-2">
          {EXPLAIN_MODES.map((mode) => {
            const on = settings.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={saving}
                onClick={() => !on && void save({ explainMode: mode })}
                className={`flex items-start gap-3 rounded-[var(--ds-radius-control)] border-2 p-3 text-start ${
                  on ? "border-ds-brand bg-ds-choice-tint" : "border-ds-line bg-ds-card"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 size-5 shrink-0 rounded-full border-2 ${
                    on ? "border-[6px] border-ds-brand" : "border-ds-ink-faint"
                  }`}
                />
                <span>
                  <b className="block ds-type-footnote font-extrabold text-ds-ink">
                    {OPTIONS[mode].title}
                    {mode === "tap" && (
                      <span className="ms-2 rounded-md bg-ds-xp-tint px-1.5 py-0.5 ds-type-overline text-ds-xp-text">
                        Default
                      </span>
                    )}
                  </b>
                  <small className="block ds-type-caption text-ds-ink-soft">
                    {OPTIONS[mode].body(language)}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="mt-2 ds-type-caption font-semibold text-ds-wrong-ink">
            {error}
          </p>
        )}
        <p className="mt-3 ds-type-caption text-ds-ink-soft">
          <b className="text-ds-ink">About these explanations.</b> Written by AI (Alphonso), so they
          can be wrong. You can report one. Free: {EXPLAIN_DAILY_LIMIT} a day. Pro learners talking
          to Hector use Hector&apos;s own allowance.
        </p>
      </div>
    </section>
  );
}
