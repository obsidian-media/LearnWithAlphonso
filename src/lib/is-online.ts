/**
 * Whether the app's own server can be reached right now: the browser's flag first, then one tiny no-store request.
 * A call (or chat) opened with no network used to navigate to the browser's own error page.
 */
export async function isOnline(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    await fetch("/favicon.ico", { method: "HEAD", cache: "no-store", signal: ctl.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}
