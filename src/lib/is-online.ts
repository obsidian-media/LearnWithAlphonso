/**
 * Whether the app's own server can be reached right now: the browser's flag first, then one tiny no-store request.
 * A call (or chat) opened with no network used to navigate to the browser's own error page.
 * Limit: behind a captive portal the request can still succeed (the portal answers), so this is a best-effort check.
 */
export async function isOnline(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    await fetch("/favicon.ico", { method: "HEAD", cache: "no-store", signal: ctl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
