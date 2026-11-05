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

// Raw-string checks: a leading "/" and no forbidden character.
function looksLikeInAppPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 2048 &&
    value.startsWith("/") &&
    !hasForbiddenChar(value)
  );
}

// Same checks after one percent-decode; also protocol-relative after
// decoding ("/%2f..." decodes to "//...").
function decodesSafely(value: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }
  return !hasForbiddenChar(decoded, true) && !decoded.startsWith("//");
}

// Resolves against a fixed origin; returns the path only if it stays there.
function resolveInApp(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return undefined;
  }
  const path = url.pathname + url.search + url.hash;
  return url.origin === PROBE_ORIGIN && path.startsWith("/") && !path.startsWith("//")
    ? path
    : undefined;
}

export function safeNextPath(value: unknown): string | undefined {
  if (!looksLikeInAppPath(value) || !decodesSafely(value)) return undefined;
  return resolveInApp(value);
}
