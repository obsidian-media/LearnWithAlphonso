/**
 * Does a story's cover image exist? The 9 linear stories read an illustrated cover by convention from the public
 * `story-art` bucket (`<course>/<slug>/cover.jpg`, see linearCoverKey) and fall back to the designed gradient when the
 * object is missing. Rather than draw an <img> that 404s on every render, the library asks once with a HEAD (no body
 * is downloaded) and remembers the answer:
 *
 *  - a 200 is remembered for the life of the process (art is not deleted in normal use);
 *  - a 404/400 ("no such object") is remembered for `missingTtlMs` only, so a cover uploaded later shows up soon
 *    without a deploy, and a missing one costs one HEAD per story per window, not one per render;
 *  - a network error, a timeout or a 5xx is an unknown, not a "missing": it is never remembered, and the card shows
 *    the gradient this once;
 *  - concurrent callers share one request.
 *
 * Chosen over a `published`-style flag column because it needs no migration, no regenerated types and no step after
 * the upload: put the file in the bucket and it appears. A flag would have to be flipped by hand per story.
 */
export type CoverProbe = { exists: (url: string) => Promise<boolean> };

export type CoverProbeOptions = {
  fetchFn?: (url: string, init: { method: "HEAD"; signal?: AbortSignal }) => Promise<Response>;
  now?: () => number;
  /** How long a "no such object" answer is trusted. */
  missingTtlMs?: number;
  /** How long a HEAD may take before the answer is "unknown". */
  timeoutMs?: number;
  /** When set, only URLs on this host are ever requested (the Supabase project's): anything else is "no cover". */
  allowedHost?: string;
};

export const COVER_MISSING_TTL_MS = 10 * 60 * 1000;
export const COVER_PROBE_TIMEOUT_MS = 2500;

export function createCoverProbe(options: CoverProbeOptions = {}): CoverProbe {
  const fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
  const now = options.now ?? Date.now;
  const missingTtlMs = options.missingTtlMs ?? COVER_MISSING_TTL_MS;
  const timeoutMs = options.timeoutMs ?? COVER_PROBE_TIMEOUT_MS;
  const allowedHost = options.allowedHost;
  const hostAllowed = (url: string) => {
    if (!allowedHost) return true;
    try {
      const u = new URL(url);
      return u.host === allowedHost;
    } catch {
      return false;
    }
  };
  const found = new Set<string>();
  const missingUntil = new Map<string, number>();
  const inFlight = new Map<string, Promise<boolean>>();

  async function ask(url: string): Promise<boolean> {
    try {
      const res = await fetchFn(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) {
        found.add(url);
        missingUntil.delete(url);
        return true;
      }
      // The object is not there (Supabase answers 400 or 404 for a missing public object): trust it for a while.
      if (res.status === 400 || res.status === 404) missingUntil.set(url, now() + missingTtlMs);
      return false;
    } catch {
      return false;
    }
  }

  return {
    exists(url) {
      if (!hostAllowed(url)) return Promise.resolve(false);
      if (found.has(url)) return Promise.resolve(true);
      const until = missingUntil.get(url);
      if (until !== undefined && now() < until) return Promise.resolve(false);
      const pending = inFlight.get(url);
      if (pending) return pending;
      const request = ask(url).finally(() => inFlight.delete(url));
      inFlight.set(url, request);
      return request;
    },
  };
}

/** The rows resolveLinearCovers reads: only what decides whether a story can have a linear cover. */
export type CoverRow = { id: string; course: string; slug: string; branching: boolean };

/**
 * A linear story's cover URL by convention, for every linear story whose cover object exists. All the existence checks
 * start together (never one after another), branching stories are never asked about (they keep their scene art), and a
 * story whose check says no, or whose URL cannot be built, is simply absent from the result.
 */
export async function resolveLinearCovers(
  rows: readonly CoverRow[],
  urlOf: (course: string, slug: string) => string | null,
  probe: CoverProbe,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    rows
      .filter((r) => !r.branching)
      .map(async (r) => {
        const url = urlOf(r.course, r.slug);
        if (url && (await probe.exists(url))) out.set(r.id, url);
      }),
  );
  return out;
}
