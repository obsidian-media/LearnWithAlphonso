import { createFileRoute } from "@tanstack/react-router";

/**
 * A learner's message to Help. Order: auth (and ban), body check, store the message, then (only if the conversation
 * is still with the AI) keyword hand-off, the AI switch and consent, quota, model, output guard. A refusal never spends
 * quota, and the learner's message is kept whatever happens after it. See src/lib/support-chat.server.ts.
 */
export const Route = createFileRoute("/api/support/message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateLearner, createSupportRuntime, toResponse } =
          await import("@/lib/support-chat-runtime.server");
        const auth = await authenticateLearner(request);
        if (!auth.ok) return auth.response;
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const { channelOf, handlePostMessage } = await import("@/lib/support-chat.server");
        return toResponse(
          await handlePostMessage(
            auth.userId,
            channelOf(request),
            raw,
            await createSupportRuntime(request),
          ),
        );
      },
    },
  },
});
