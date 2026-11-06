import { createFileRoute } from "@tanstack/react-router";
import { appUpdateConfigFromEnv } from "@/lib/app-update-gate";

/**
 * GET /api/app-config: the lowest iOS build and Android versionCode the server still supports, and where to update.
 * Public and unauthenticated (it is read before sign-in), and holds nothing private. Both minimums are null unless
 * the owner sets them, so the "Please update" gate is off by default (src/lib/app-update-gate.ts).
 */
export const Route = createFileRoute("/api/app-config")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(appUpdateConfigFromEnv(), {
          headers: { "Cache-Control": "public, max-age=300" },
        }),
    },
  },
});
