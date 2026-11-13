import { createFileRoute } from "@tanstack/react-router";
import { appUpdateConfigFromEnv } from "@/lib/app-update-gate";

/**
 * GET /api/app-config: the lowest iOS build and Android versionCode the server still supports, and where to update.
 * Public and unauthenticated (it is read before sign-in), and holds nothing private. Both minimums are null unless
 * the owner sets them, so the "Please update" gate is off by default (src/lib/app-update-gate.ts). Also `limits`:
 * the per-day AI limits the clients check ahead of the server (today `hectorDaily`).
 */
export const Route = createFileRoute("/api/app-config")({
  server: {
    handlers: {
      GET: async () => {
        // The limits the clients show or check ahead of the server: told here so no app holds its own copy.
        const { DAILY_LIMITS } = await import("@/lib/ai-quota.server");
        return Response.json(
          { ...appUpdateConfigFromEnv(), limits: { hectorDaily: DAILY_LIMITS.hector } },
          { headers: { "Cache-Control": "public, max-age=300" } },
        );
      },
    },
  },
});
