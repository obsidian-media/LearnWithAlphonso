import { createFileRoute } from "@tanstack/react-router";
import { appUpdateConfigFromEnv } from "@/lib/app-update-gate";
import { rehearsalsEnabled } from "@/lib/rehearsals-flag";

/**
 * GET /api/app-config: the lowest iOS build and Android versionCode the server still supports, and where to update.
 * Public and unauthenticated (it is read before sign-in), and holds nothing private. Both minimums are null unless
 * the owner sets them, so the "Please update" gate is off by default (src/lib/app-update-gate.ts). Also `limits`:
 * the per-day AI limits the clients check ahead of the server (today `hectorDaily`), and `features` (today
 * `rehearsals`, the REHEARSALS_ENABLED switch, so native can hide the entry while it is off).
 */
export const Route = createFileRoute("/api/app-config")({
  server: {
    handlers: {
      GET: async () => {
        // The limits the clients show or check ahead of the server: told here so no app holds its own copy.
        const { DAILY_LIMITS } = await import("@/lib/ai-quota.server");
        return Response.json(
          {
            ...appUpdateConfigFromEnv(),
            limits: { hectorDaily: DAILY_LIMITS.hector },
            // Server switches the clients read before showing a feature (web and native switch together).
            features: { rehearsals: rehearsalsEnabled() },
          },
          { headers: { "Cache-Control": "public, max-age=300" } },
        );
      },
    },
  },
});
