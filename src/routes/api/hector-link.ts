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
 * **Every failure here is soft**, same posture as `/api/apple-link`:
 * the user is already enrolled in Hector by the time this fires (the
 * real enrollment already happened against Cloud Voice's own backend)
 * -- this endpoint only exists so a *future* deletion can reach that
 * account, so the app never blocks or delays Hector enrollment on it.
 */
const BodySchema = z.object({ cloudVoiceUserId: z.string().uuid() });

export const Route = createFileRoute("/api/hector-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        const accessToken = authHeader?.replace(/^Bearer\s+/i, "");
        if (!accessToken) {
          return Response.json({ linked: false, reason: "unauthorized" }, { status: 401 });
        }

        let cloudVoiceUserId: string;
        try {
          cloudVoiceUserId = BodySchema.parse(await request.json()).cloudVoiceUserId;
        } catch {
          return Response.json({ linked: false, reason: "bad-request" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
        if (userError || !userData?.user) {
          return Response.json({ linked: false, reason: "unauthorized" }, { status: 401 });
        }

        // Upsert: re-enrolling in Hector (a new device, a fresh sign-in)
        // issues the same Cloud Voice account again in practice, but if
        // it ever didn't, the newest link is the one revocation should use.
        const { error } = await supabaseAdmin
          .from("hector_links")
          .upsert({ user_id: userData.user.id, cloud_voice_user_id: cloudVoiceUserId }, { onConflict: "user_id" });
        if (error) return Response.json({ linked: false, reason: "store-failed" });

        return Response.json({ linked: true });
      },
    },
  },
});
