/**
 * The learner's voice choices on the web (Settings > Voices). Stored on the account in Supabase auth
 * `user_metadata.voices`, so they follow the learner to iOS and Android, and cached in localStorage so a call never
 * waits on the network to pick its voice. The server re-checks every voice against the allow-list.
 */
import { useCallback, useEffect, useState } from "react";
import type { Course } from "@/data/courses";
import { supabase } from "@/integrations/supabase/client";
import {
  VOICE_PREFS_METADATA_KEY,
  chosenVoice,
  parseVoicePrefs,
  withVoiceChoice,
  type VoiceCharacter,
  type VoicePrefs,
} from "./voice-catalog";

export const VOICE_PREFS_STORAGE_KEY = "alphonso.voicePrefs.v1";

export function readCachedVoicePrefs(): VoicePrefs {
  try {
    const raw = globalThis.localStorage?.getItem(VOICE_PREFS_STORAGE_KEY);
    return raw ? parseVoicePrefs(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function cacheVoicePrefs(prefs: VoicePrefs) {
  try {
    globalThis.localStorage?.setItem(VOICE_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode: the account copy still holds the choice */
  }
}

/** Forgets the cached choices; called on sign-out, because the cache belongs to the account that made them. */
export function clearCachedVoicePrefs() {
  try {
    globalThis.localStorage?.removeItem(VOICE_PREFS_STORAGE_KEY);
  } catch {
    /* nothing cached */
  }
}

/**
 * The account's choices from the locally stored session (no network), cached. A signed-in session is
 * authoritative: an account that never chose gets the defaults, never another account's cached choice. The cache is
 * only the fallback when the session cannot be read.
 */
export async function loadVoicePrefs(): Promise<VoicePrefs> {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (user) {
      const prefs = parseVoicePrefs(user.user_metadata?.[VOICE_PREFS_METADATA_KEY]);
      cacheVoicePrefs(prefs);
      return prefs;
    }
  } catch {
    /* fall through to the cache */
  }
  return readCachedVoicePrefs();
}

/** The voice to send with a request for this character and course. */
export async function voiceFor(character: VoiceCharacter, course: Course): Promise<string> {
  return chosenVoice(await loadVoicePrefs(), character, course);
}

/** Saves one choice to the account, then the cache; a failed save changes neither and throws. */
export async function saveVoiceChoice(
  character: VoiceCharacter,
  course: Course,
  id: string,
): Promise<VoicePrefs> {
  const next = withVoiceChoice(await loadVoicePrefs(), character, course, id);
  const { error } = await supabase.auth.updateUser({ data: { [VOICE_PREFS_METADATA_KEY]: next } });
  if (error) throw error;
  cacheVoicePrefs(next);
  return next;
}

export function useVoicePrefs() {
  const [prefs, setPrefs] = useState<VoicePrefs>(() => readCachedVoicePrefs());
  useEffect(() => {
    let live = true;
    void loadVoicePrefs().then((p) => {
      if (live) setPrefs(p);
    });
    return () => {
      live = false;
    };
  }, []);
  const choose = useCallback(async (character: VoiceCharacter, course: Course, id: string) => {
    setPrefs((p) => withVoiceChoice(p, character, course, id));
    try {
      setPrefs(await saveVoiceChoice(character, course, id));
    } catch (e) {
      setPrefs(await loadVoicePrefs());
      throw e;
    }
  }, []);
  return { prefs, choose };
}
