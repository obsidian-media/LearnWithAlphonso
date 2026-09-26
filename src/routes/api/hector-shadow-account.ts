import { createFileRoute } from "@tanstack/react-router";

/**
 * Hector re-parenting Phase 1
 * (docs/superpowers/specs/2026-09-26-hector-reparenting-design.md):
 * the authorization gate for a silent, entitlement-only Hector unlock.
 *
 * **This is the part that matters most to get right.** A Pro-only
 * feature that anyone could reach by calling this endpoint would be
 * worse than the second-login UX this is meant to remove -- so the
 * RevenueCat check below runs, and is confirmed true, before this ever
 * attempts to provision a Cloud Voice shadow account. Not yet called
 * from the iOS client: AlphonsoEcosystem's shadow-account endpoint
 * (`hector-shadow-account.ts`'s own header comment has the exact
 * contract) doesn't exist yet, so there is nothing real to wire a UI
 * to. This ships now as the tested, working authorization gate;
 * wiring the client is the natural follow-up once that endpoint is
 * real.
 */
export const Route = createFileRoute("/api/hector-shadow-account")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        const accessToken = authHeader?.replace(/^Bearer\s+/i, "");
        if (!accessToken) {
          return Response.json({ available: false, reason: "unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
        if (userError || !userData?.user) {
          return Response.json({ available: false, reason: "unauthorized" }, { status: 401 });
        }

        const { revenueCatConfigFromEnv, isProSubscriber } =
          await import("@/lib/revenuecat-entitlement");
        const revenueCatConfig = revenueCatConfigFromEnv();
        // Fails closed: if entitlement can't be verified at all (the
        // secret isn't set yet), the safe answer is "not entitled", not
        // "let them through". Same class of decision as this file's own
        // header comment -- getting this backwards is the whole risk.
        if (!revenueCatConfig) {
          return Response.json(
            { available: false, reason: "entitlement-check-unavailable" },
            { status: 403 },
          );
        }

        const isPro = await isProSubscriber(revenueCatConfig, userData.user.id);
        if (!isPro) {
          return Response.json({ available: false, reason: "not-entitled" }, { status: 403 });
        }

        const { hectorShadowAccountConfigFromEnv, provisionShadowAccount } =
          await import("@/lib/hector-shadow-account");
        const shadowConfig = hectorShadowAccountConfigFromEnv();
        // Not an error: the Cloud Voice endpoint this needs does not
        // exist yet (see hector-shadow-account.ts). The caller is
        // confirmed Pro -- this is purely "the integration isn't built
        // yet", not "you can't have this".
        if (!shadowConfig) {
          return Response.json({ available: false, reason: "not-configured" });
        }

        const session = await provisionShadowAccount(shadowConfig, userData.user.id);
        if (!session) {
          return Response.json({ available: false, reason: "shadow-account-unavailable" });
        }

        return Response.json({
          available: true,
          cloudVoiceUserId: session.cloudVoiceUserId,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
        });
      },
    },
  },
});
