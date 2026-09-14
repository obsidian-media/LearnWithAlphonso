// Our /api/* routes return errors as { error: string } JSON. Some
// non-2xx responses (e.g. a proxy timeout) may not be JSON at all, so
// fall back to the raw text rather than throwing.
export async function readApiError(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}
