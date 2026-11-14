import { createFileRoute } from "@tanstack/react-router";

/**
 * The learner's own Help conversation: status, messages (id, kind, body, time only; no author ids, summary or facts)
 * and an unread count. Marks it read. The learner id is the verified session's, never a parameter.
 */
export const Route = createFileRoute("/api/support/conversation")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticateLearner, createSupportRuntime, toResponse } =
          await import("@/lib/support-chat-runtime.server");
        const auth = await authenticateLearner(request);
        if (!auth.ok) return auth.response;
        const { handleGetConversation } = await import("@/lib/support-chat.server");
        return toResponse(
          await handleGetConversation(auth.userId, await createSupportRuntime(request)),
        );
      },
    },
  },
});
