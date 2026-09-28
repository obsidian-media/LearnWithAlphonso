import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Receives the one-time Apple authorization code after a native Sign in
 * with Apple, exchanges it for a refresh token, and stores that token so
 * account deletion can revoke the grant later -- which Apple requires.
 *
 * Why a dedicated endpoint rather than doing this during sign-in: the
 * exchange needs the team's `.p8` private key, which must never reach the
 * app binary. The app holds the code for the few seconds it takes to post
 * it here and nothing else.
 *
 * **Every failure here is soft.** The user is already authenticated by the
 * identity token Supabase verified -- this endpoint exists only so a future
 * deletion can revoke cleanly. Failing sign-in because Apple's token
 * endpoint had a bad minute would be a far worse trade, so the response
 * always says what happened and the app never blocks on it.
 */
const BodySchema = z.object({ authorizationCode: z.string().min(1) });

export const Route = createFileRoute("/api/apple-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        const accessToken = authHeader?.replace(/^Bearer\s+/i, "");
        if (!accessToken) {
          return Response.json({ linked: false, reason: "unauthorized" }, { status: 401 });
        }

        let authorizationCode: string;
        try {
          authorizationCode = BodySchema.parse(await request.json()).authorizationCode;
        } catch {
          return Response.json({ linked: false, reason: "bad-request" }, { status: 400 });
        }

        const { appleConfigFromEnv, exchangeAuthorizationCode } =
          await import("@/lib/apple-revocation");
        const config = appleConfigFromEnv();
        // Not an error to the CALLER (the app ships before these secrets
        // exist, and saying so plainly beats a 500 that looks like a bug)
        // -- but it is worth a server-side trace: this endpoint is the
        // ENTIRE mechanism account deletion later depends on to revoke a
        // Sign in with Apple grant, so secrets missing/dropped in the
        // deployed environment must not fail silently forever (found in
        // a second-opinion audit, 2026-09-28 -- every failure branch here
        // returned a soft response to the app, by design, but none of
        // them left a trace anywhere a human could actually find later).
        // Checkable from Vercel's dashboard -- no Mac or device needed.
        if (!config) {
          console.error("[apple-link] Apple secrets not configured in this environment");
          return Response.json({ linked: false, reason: "not-configured" });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
        if (userError || !userData?.user) {
          return Response.json({ linked: false, reason: "unauthorized" }, { status: 401 });
        }

        const refreshToken = await exchangeAuthorizationCode(config, authorizationCode);
        // Apple rejected the code -- commonly because it was already spent.
        // Nothing to store, and nothing the user can do about it, but
        // still worth a trace: a spike of these would mean something
        // upstream (the iOS client, or Apple's own endpoint) changed
        // shape, not that this is expected background noise.
        if (!refreshToken) {
          console.error(
            `[apple-link] Apple rejected the authorization code exchange for user ${userData.user.id}`,
          );
          return Response.json({ linked: false, reason: "exchange-failed" });
        }

        // Upsert: signing in with Apple again issues a new grant, and the
        // newest token is the one revocation must use.
        const { error } = await supabaseAdmin.from("apple_auth_tokens").upsert(
          {
            user_id: userData.user.id,
            refresh_token: refreshToken,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        if (error) {
          console.error(
            `[apple-link] Failed to store the Apple refresh token for user ${userData.user.id}: ${error.message}`,
          );
          return Response.json({ linked: false, reason: "store-failed" });
        }

        return Response.json({ linked: true });
      },
    },
  },
});
