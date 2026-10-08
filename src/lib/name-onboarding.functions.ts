import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { profileErrorCode } from "./profile-error";
import { namePrefill, needsNamePrompt, pickUserNames } from "./name-onboarding";

export type NameStatusResult = {
  displayName: string;
  needsPrompt: boolean;
  prefill: string;
} | null;
export type ConfirmNameResult =
  | { ok: true; name: string }
  | { ok: false; error: "blocked-content" | "invalid-name" | "server-error" };

const nameInput = (d: unknown) => z.object({ name: z.string().max(200) }).parse(d);

/**
 * The learner's own name status (get_my_name_status) and the prefill from the JWT's user_metadata. Null means
 * there is no profile row: the client skips the prompt this visit.
 */
export const getNameStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NameStatusResult> => {
    const { data, error } = await context.supabase.rpc("get_my_name_status");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;
    const meta = (context.claims as { user_metadata?: Record<string, unknown> }).user_metadata;
    return {
      displayName: row.display_name,
      needsPrompt: needsNamePrompt(row.name_confirmed_at),
      prefill: namePrefill({ names: pickUserNames(meta), currentName: row.display_name }),
    };
  });

/** Live check: the server filter's verdict without saving. An unreachable filter is "unverified", never "fine". */
export const checkDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nameInput)
  .handler(async ({ data, context }): Promise<{ problem: string | null; unverified: boolean }> => {
    const { data: problem, error } = await context.supabase.rpc("display_name_problem", {
      _name: data.name,
    });
    if (error) return { problem: null, unverified: true };
    return { problem: problem ?? null, unverified: false };
  });

export const confirmName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(nameInput)
  .handler(async ({ data, context }): Promise<ConfirmNameResult> => {
    const { data: stored, error } = await context.supabase.rpc("confirm_display_name", {
      _name: data.name,
    });
    if (error) return { ok: false, error: profileErrorCode(error) };
    return { ok: true, name: stored as string };
  });

/** "Skip": keeps or creates a Learner-XXXX handle; never publishes a full name (skip_display_name_prompt). */
export const skipName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true; name: string } | { ok: false }> => {
    const { data: stored, error } = await context.supabase.rpc("skip_display_name_prompt");
    if (error || typeof stored !== "string") return { ok: false };
    return { ok: true, name: stored };
  });
