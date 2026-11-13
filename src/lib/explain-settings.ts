import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { explainModeOf, type ExplainMode } from "./explain";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "./learner-profile";

/**
 * The learner's "Explain in my language" settings on the web: their native language (first run, or changed in
 * Settings) and how they want help (tap, always, or target language only). Both live in Supabase auth
 * `user_metadata.learner_profile`, so they follow the learner to the iPhone and Android apps; no table.
 */
export type ExplainSettings = { nativeLanguage: string | undefined; mode: ExplainMode };

export function explainSettingsFromMetadata(
  meta: Record<string, unknown> | undefined,
): ExplainSettings {
  const profile = parseLearnerProfile(meta?.[LEARNER_PROFILE_KEY]);
  return { nativeLanguage: profile.nativeLanguage, mode: explainModeOf(profile.explainMode) };
}

const CHANGED = "alphonso:explain-settings-changed";

/** Tells every mounted screen that Settings saved a new language or mode. */
export function announceExplainSettingsChanged() {
  try {
    globalThis.dispatchEvent?.(new Event(CHANGED));
  } catch {
    /* no window: nothing mounted to tell */
  }
}

export async function loadExplainSettings(): Promise<ExplainSettings> {
  try {
    const { data } = await supabase.auth.getSession();
    return explainSettingsFromMetadata(data.session?.user?.user_metadata);
  } catch {
    return explainSettingsFromMetadata(undefined);
  }
}

/** The settings from the local session (no network). `null` until read, so a screen shows nothing rather than flashing a chip. */
export function useExplainSettings(): ExplainSettings | null {
  const [settings, setSettings] = useState<ExplainSettings | null>(null);
  const refresh = useCallback(() => {
    void loadExplainSettings().then(setSettings);
  }, []);
  useEffect(() => {
    refresh();
    globalThis.addEventListener?.(CHANGED, refresh);
    return () => globalThis.removeEventListener?.(CHANGED, refresh);
  }, [refresh]);
  return settings;
}
