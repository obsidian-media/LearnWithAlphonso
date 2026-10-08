/** Strips API keys from anything about to be printed. The Pixabay key travels in the query string. */
export function redactKeys(text: string, secrets: (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("[redacted]");
  return out.replace(/([?&]key=)[^&\s"']+/g, "$1[redacted]");
}
