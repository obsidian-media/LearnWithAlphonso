// Shared error-response shaping for the /api/* AI routes. Upstream
// provider errors (OpenRouter, Deepgram) are never forwarded to the client
// -- their raw text can include internal details (request ids,
// model-routing errors, account state) -- and are not logged verbatim
// either: moderation and context-length errors can echo the user's own
// text back (e.g. a flagged_input field), so the log keeps only the status
// and a short machine code from the body.
export function upstreamErrorResponse(provider: string, status: number, rawBody: string): Response {
  console.error(`[api] ${provider} upstream error (${status}) code=${upstreamErrorCode(rawBody)}`);
  const message = status === 429 ? "Rate limited, please try again shortly" : "Request failed";
  return Response.json({ error: message }, { status });
}

// Short error code/type from a JSON error body (OpenRouter: error.code,
// Deepgram: err_code), or "unknown". Never the free-text message.
export function upstreamErrorCode(rawBody: string): string {
  try {
    const b = JSON.parse(rawBody) as {
      error?: { code?: unknown; type?: unknown } | unknown;
      err_code?: unknown;
    };
    const e =
      typeof b.error === "object" && b.error ? (b.error as { code?: unknown; type?: unknown }) : {};
    for (const c of [e.code, e.type, b.err_code]) {
      if (
        (typeof c === "string" || typeof c === "number") &&
        /^[A-Za-z0-9_.-]{1,64}$/.test(String(c))
      ) {
        return String(c);
      }
    }
  } catch {
    // not JSON
  }
  return "unknown";
}
