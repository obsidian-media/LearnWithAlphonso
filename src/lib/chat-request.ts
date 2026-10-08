/**
 * POST /api/chat, retrying once when the server reports `502 { error: "empty-reply" }` (the model returned
 * nothing). One retry only: a second empty reply is shown as an error, never looped on.
 */
export async function postChat(
  body: unknown,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
  const first = await fetchImpl("/api/chat", init);
  if (first.status !== 502) return first;
  const code = await first
    .clone()
    .json()
    .then((j: { error?: unknown }) => j?.error)
    .catch(() => null);
  return code === "empty-reply" ? fetchImpl("/api/chat", init) : first;
}
