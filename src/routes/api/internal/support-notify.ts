import { createFileRoute } from "@tanstack/react-router";
import { handleSupportNotify } from "@/lib/support-notify.server";

/** DB trigger target only (support_queue_staff_reply); see src/lib/support-notify.server.ts. */
export const Route = createFileRoute("/api/internal/support-notify")({
  server: {
    handlers: {
      POST: async ({ request }) => handleSupportNotify(request),
    },
  },
});
