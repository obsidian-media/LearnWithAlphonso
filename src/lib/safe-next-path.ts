// The one place a post-sign-in "next" / return-to value is vetted before
// it is used as a redirect target or embedded in an emailed link.
//
// Only an in-app path is allowed. A string that merely starts with "/" is
// not enough: browsers treat "/\evil.com" like "//evil.com", strip tab and
// newline characters from URLs, and a "%2f" or "%5c" can turn into a
// separator after one decode, so the value is checked raw and decoded and
// then resolved against a fixed origin with the URL constructor; it is
// accepted only if it stays on that origin.
const PROBE_ORIGIN = "https://app.invalid";
const BACKSLASH = 0x5c;

// Control characters (incl. tab, CR, LF), space, DEL, C1 controls and the
// backslash never belong in an in-app path, raw or percent-decoded.
// A space is allowed only once decoded ("%20" is a normal path character).
function hasForbiddenChar(s: string, allowSpace = false): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x20 && allowSpace) continue;
    if (c <= 0x20 || (c >= 0x7f && c <= 0x9f) || c === BACKSLASH) return true;
  }
  return false;
}

export function safeNextPath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return undefined;
  if (!value.startsWith("/")) return undefined;
  if (hasForbiddenChar(value)) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return undefined;
  }
  if (hasForbiddenChar(decoded, true)) return undefined;
  // Protocol-relative, raw or after decoding ("/%2f..." decodes to "//...").
  if (decoded.startsWith("//")) return undefined;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return undefined;
  }
  if (url.origin !== PROBE_ORIGIN) return undefined;
  const path = url.pathname + url.search + url.hash;
  return path.startsWith("/") && !path.startsWith("//") ? path : undefined;
}
