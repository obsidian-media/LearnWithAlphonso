// Shared error-response shaping for the /api/* AI routes. Upstream
// provider errors (NVIDIA, Deepgram) are logged server-side in full but
// never forwarded verbatim to the client -- their raw text can include
// internal details (request ids, model-routing errors, account state)
// that shouldn't leak past our own API surface.
export function upstreamErrorResponse(provider: string, status: number, rawBody: string): Response {
  console.error(`[api] ${provider} upstream error (${status}):`, rawBody.slice(0, 2000));
  const message = status === 429 ? "Rate limited, please try again shortly" : "Request failed";
  return Response.json({ error: message }, { status });
}
