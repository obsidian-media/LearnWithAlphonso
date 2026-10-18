import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Records where a NEW account came from, once. The database function validates the tags, ignores
 * accounts older than 7 days and never overwrites. See docs/attribution.md.
 */
export const recordSignupAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        source: z.string().max(200).nullable(),
        medium: z.string().max(200).nullable(),
        campaign: z.string().max(200).nullable(),
        landedAt: z.string().max(40).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ result: string }> => {
    const landed = data.landedAt && !Number.isNaN(Date.parse(data.landedAt)) ? data.landedAt : null;
    const { data: result, error } = await context.supabase.rpc("record_signup_attribution", {
      p_source: data.source ?? undefined,
      p_medium: data.medium ?? undefined,
      p_campaign: data.campaign ?? undefined,
      p_landed_at: landed ?? undefined,
    });
    if (error) throw new Error("Couldn't record sign-up source.");
    return { result: String(result) };
  });
