import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The web's reads and writes of profiles.ai_consent_at, always through the RPCs (never a profiles PATCH). */
export const getAiConsent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ grantedAt: string | null }> => {
    const { data, error } = await context.supabase.rpc("get_ai_consent");
    if (error) throw new Error("Couldn't load your AI setting.");
    return { grantedAt: (data as string | null) ?? null };
  });

export const setAiConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ granted: z.boolean() }).parse(d))
  .handler(async ({ data, context }): Promise<{ grantedAt: string | null }> => {
    const { data: stamp, error } = await context.supabase.rpc("set_ai_consent", {
      _granted: data.granted,
    });
    if (error) throw new Error("Couldn't save your AI setting.");
    return { grantedAt: (stamp as string | null) ?? null };
  });
