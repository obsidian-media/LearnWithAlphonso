import { createFileRoute } from "@tanstack/react-router";
import { handleMaintenance } from "@/lib/maintenance.server";

/** Scheduled database job target only (run_maintenance_sweep); see src/lib/maintenance.server.ts. */
export const Route = createFileRoute("/api/internal/maintenance")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMaintenance(request),
    },
  },
});
