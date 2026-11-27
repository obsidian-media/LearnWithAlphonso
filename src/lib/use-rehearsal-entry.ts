import { useEffect, useState } from "react";
import type { Course } from "@/data/course-meta";
import { fetchRehearsals, type RehearsalState } from "./rehearsal-api";

/**
 * Whether Rehearsals is on for this deployment: the server flag, read from the public /api/app-config (the same
 * answer the native apps read). One request per page load; a failure reads as "off", so a feature that cannot be
 * confirmed is never shown.
 */
let appConfig: Promise<boolean> | null = null;
export const _resetAppConfigCache = () => {
  appConfig = null;
};
export function rehearsalsOn(): Promise<boolean> {
  appConfig ??= fetch("/api/app-config")
    .then((r) => (r.ok ? r.json() : null))
    .then((b: { features?: { rehearsals?: unknown } } | null) => b?.features?.rehearsals === true)
    .catch(() => false);
  return appConfig;
}

export type RehearsalEntry = { status: "off" | "loading" | "ready"; state: RehearsalState | null };

/** The entry's state: off (flag off, or the state could not be read), loading, or ready with the learner's state. */
export function useRehearsalEntry(course: Course): RehearsalEntry {
  const [entry, setEntry] = useState<RehearsalEntry>({ status: "loading", state: null });
  useEffect(() => {
    let live = true;
    setEntry({ status: "loading", state: null });
    void rehearsalsOn().then(async (on) => {
      if (!on) return live && setEntry({ status: "off", state: null });
      const r = await fetchRehearsals(course);
      if (live)
        setEntry(r.ok ? { status: "ready", state: r.value } : { status: "off", state: null });
    });
    return () => {
      live = false;
    };
  }, [course]);
  return entry;
}
