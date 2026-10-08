import { createFileRoute } from "@tanstack/react-router";
import { handleReportNotify } from "@/lib/report-notify.server";

/** DB trigger target only (notify_content_report); see src/lib/report-notify.server.ts. */
export const Route = createFileRoute("/api/internal/report-notify")({
  server: {
    handlers: {
      POST: async ({ request }) => handleReportNotify(request),
    },
  },
});
