import { createFileRoute } from "@tanstack/react-router";

/** The "Talk to a person" button. Hands the learner's conversation to staff (reason learner_asked). */
export const Route = createFileRoute("/api/support/handoff")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateLearner, createSupportRuntime, toResponse } =
          await import("@/lib/support-chat-runtime.server");
        const auth = await authenticateLearner(request);
        if (!auth.ok) return auth.response;
        const { channelOf, handlePostHandoff } = await import("@/lib/support-chat.server");
        return toResponse(
          await handlePostHandoff(
            auth.userId,
            channelOf(request),
            await createSupportRuntime(request),
          ),
        );
      },
    },
  },
});
