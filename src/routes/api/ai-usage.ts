import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/ai-usage: where the signed-in learner stands against this month's AI usage limit, so a client can show a
 * gentle "nearly there" note and a "limit reached" state without holding a copy of any number. Percent only: the
 * dollar ceilings are server settings (src/lib/ai-monthly-cap.ts) and never leave the server.
 *
 *   { state: "ok" | "warn" | "capped" | "unknown", percentUsed: 0-100, resetsAt }
 *
 * "unknown" is the fail-safe answer (the cost could not be read, or the cap is off): the client shows nothing, and the
 * server still decides each AI call itself. Presentation only; the cap is enforced in consumeQuotaFor.
 */
async function handle(request: Request): Promise<Response> {
  const { verifyAuth } = await import("@/lib/ai-quota.server");
  const auth = await verifyAuth(request);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });
  const { readMonthlyCap } = await import("@/lib/ai-monthly-cap.server");
  const reading = await readMonthlyCap(auth.supabase, null);
  return Response.json(
    {
      state: reading.status?.state ?? "unknown",
      percentUsed: reading.status?.percentUsed ?? 0,
      resetsAt: reading.resetsAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/ai-usage")({
  server: { handlers: { GET: async ({ request }) => handle(request) } },
});
