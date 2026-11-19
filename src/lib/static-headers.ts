/**
 * Security headers for files Vercel's CDN serves straight from the build output (public/ and the hashed /assets/
 * chunks). Those responses never pass through src/server.ts, so addSecurityHeaders (security-policy.ts) does not
 * reach them. Two places apply this one list: vercel.json `headers` and the Nitro routeRules in vite.config.ts
 * (Nitro writes them into .vercel/output/config.json). static-headers.test.ts fails when either drifts from here,
 * when a public/ folder or root file is missing, or when Referrer-Policy stops matching the app responses'.
 *
 * includeSubDomains here covers only hosts *under* learn.alphonsoecosystem.app, never sibling hosts such as
 * discover.alphonsoecosystem.app: HSTS is scoped to the host that sends it.
 */
/** The one HSTS value: static files (here) and app responses (security-policy.ts) both send exactly this. */
export const HSTS_VALUE = "max-age=31536000; includeSubDomains";

export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Strict-Transport-Security", value: HSTS_VALUE },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

/** /assets is Vite's hashed build output; the rest are the top-level folders of public/. */
export const STATIC_DIRS = [
  "assets",
  ".well-known",
  "alphonso",
  "avatar",
  "avatars",
  "badges",
  "brand",
  "clips",
  "figures",
  "firstrun",
  "flags",
  "fonts",
  "hector",
  "icons3d",
  "mascots",
  "paywall",
  "scenes",
  "sfx",
  "voices",
] as const;

/** Files at the root of public/. */
export const STATIC_ROOT_FILES = [
  "apple-touch-icon.png",
  "favicon-16.png",
  "favicon-32.png",
  "favicon.ico",
  "icon-192.png",
  "icon-512.png",
  "og-image.png",
  "site.webmanifest",
] as const;

/** vercel.json `headers` sources (path-to-regexp syntax; dots escaped inside the regex groups). */
export function vercelHeaderSources(): string[] {
  const group = (names: readonly string[]) => names.map((n) => n.replaceAll(".", "\\.")).join("|");
  return [`/:dir(${group(STATIC_DIRS)})/:path*`, `/:file(${group(STATIC_ROOT_FILES)})`];
}

/** Nitro routeRules keys (rou3 glob syntax). */
export function nitroStaticRoutes(): string[] {
  return [...STATIC_DIRS.map((d) => `/${d}/**`), ...STATIC_ROOT_FILES.map((f) => `/${f}`)];
}

export function staticHeaderRecord(): Record<string, string> {
  return Object.fromEntries(STATIC_SECURITY_HEADERS.map((h) => [h.key, h.value]));
}
