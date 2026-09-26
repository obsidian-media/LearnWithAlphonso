import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Hector re-parenting, Phase 0
 * (docs/superpowers/specs/2026-09-26-hector-reparenting-design.md):
 * records which Cloud Voice (Hector) account belongs to this account,
 * called once right after Hector's existing email/OTP enrollment
 * succeeds (unchanged), so a later account deletion can revoke it via
 * `hector-revocation.ts`.
 *
 * **Every storage failure here is soft**, same posture as `/api/apple-link`:
 * the user is already enrolled in Hector by the time this fires (the
 * real enrollment already happened against Cloud Voice's own backend)
 * -- this endpoint only exists so a *future* deletion can reach that
 * account, so the app never blocks or delays Hector enrollment on it.
 *
 * **Authorization is not soft.** This endpoint used to accept
 * `cloudVoiceUserId` straight from the body, validated for UUID shape
 * only -- nothing proved the caller controlled that Cloud Voice account,
 * so anyone who knew a victim's id could plant it here first. The fix
 * mirrors `/api/apple-link`'s own pattern (never trust a claimed
 * identity, only a token this server verifies itself): the client sends
 * its Cloud Voice access token, and `cloud-voice-auth.ts` derives the
 * real id server-side against Cloud Voice's own Supabase project. A
 * missing `cloud-voice-auth` config, or a token that fails verification,
 * fails closed to "not linked" -- see `resolveCloudVoiceUserId`'s own
 * doc comment for why that one path is never allowed to soft-fail into
 * trusting the body instead.
 */
const BodySchema = z.object({ cloudVoiceAccessToken: z.string().min(1) });

export const Route = createFileRoute("/api/hector-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        const accessToken = authHeader?.replace(/^Bearer\s+/i, "");
        if (!accessToken) {
          return Response.json({ linked: false, reason: "unauthorized" }, { status: 401 });
        }

        let cloudVoiceAccessToken: string;
        try {
          cloudVoiceAccessToken = BodySchema.parse(await request.json()).cloudVoiceAccessToken;
        } catch {
          return Response.json({ linked: false, reason: "bad-request" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
        if (userError || !userData?.user) {
          return Response.json({ linked: false, reason: "unauthorized" }, { status: 401 });
        }

        const { cloudVoiceAuthConfigFromEnv, resolveCloudVoiceUserId } =
          await import("@/lib/cloud-voice-auth");
        const config = cloudVoiceAuthConfigFromEnv();
        // Fail closed: with no way to verify a Cloud Voice token, there
        // is no way to confirm the caller controls the account -- never
        // fall back to trusting a client-supplied id.
        if (!config) return Response.json({ linked: false, reason: "not-configured" });

        const cloudVoiceUserId = await resolveCloudVoiceUserId(config, cloudVoiceAccessToken);
        // The token didn't verify -- expired, invalid, or Cloud Voice was
        // unreachable. Same fail-closed rule: never substitute anything
        // the request claimed.
        if (!cloudVoiceUserId) {
          return Response.json({ linked: false, reason: "cloud-voice-unauthorized" });
        }

        // Upsert: re-enrolling in Hector (a new device, a fresh sign-in)
        // issues the same Cloud Voice account again in practice, but if
        // it ever didn't, the newest link is the one revocation should use.
        const { error } = await supabaseAdmin
          .from("hector_links")
          .upsert(
            { user_id: userData.user.id, cloud_voice_user_id: cloudVoiceUserId },
            { onConflict: "user_id" },
          );
        if (error) return Response.json({ linked: false, reason: "store-failed" });

        return Response.json({ linked: true });
      },
    },
  },
});
