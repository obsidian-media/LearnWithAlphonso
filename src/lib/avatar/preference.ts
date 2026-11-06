import { useState } from "react";
import { create } from "zustand";
import { AVATAR_PREFERENCE_DEFAULT, AVATAR_PREFERENCE_KEY } from "./layers";

/**
 * "Show Alphonso while practising". On by default, kept on this device (like the iOS setting). The store starts at
 * the default on both server and client so the first render always matches; `hydrate()` then reads the stored
 * choice after mount.
 */
type PreferenceState = {
  enabled: boolean;
  hydrate: () => void;
  setEnabled: (enabled: boolean) => void;
};

function readStored(): boolean {
  try {
    const raw = localStorage.getItem(AVATAR_PREFERENCE_KEY);
    return raw === "false" ? false : raw === "true" ? true : AVATAR_PREFERENCE_DEFAULT;
  } catch {
    return AVATAR_PREFERENCE_DEFAULT;
  }
}

export const useAvatarPreference = create<PreferenceState>()((set, get) => ({
  enabled: AVATAR_PREFERENCE_DEFAULT,
  hydrate: () => {
    const enabled = readStored();
    if (get().enabled !== enabled) set({ enabled });
  },
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(AVATAR_PREFERENCE_KEY, String(enabled));
    } catch {
      /* private browsing: the choice lasts for this visit only */
    }
    set({ enabled });
  },
}));

/**
 * The switch for a screen that only ever renders in the browser (never server-rendered), read from storage before
 * its first render. Hydrating in a mount effect instead commits one render at the default ("on") first, so with the
 * setting off the full-screen call would flash up and then be torn down.
 */
export function useStoredAvatarPreference(): boolean {
  useState(() => useAvatarPreference.getState().hydrate());
  return useAvatarPreference((st) => st.enabled);
}
