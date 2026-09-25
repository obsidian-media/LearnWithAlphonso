import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminUser, UNAUTHORIZED_MESSAGE } from "./admin-auth";

/**
 * Gate for every admin server function.
 *
 * Chains onto requireSupabaseAuth (which validates the Bearer token and
 * yields userId) and then checks the allowlist with the SERVICE-ROLE
 * client, because admin_users is unreadable with the caller's own token
 * by design.
 *
 * The thrown message is byte-identical to one requireSupabaseAuth
 * already produces (UNAUTHORIZED_MESSAGE), so a non-admin holding a
 * valid token cannot be told apart from someone holding a bad one. An
 * earlier version threw a bare "Unauthorized", which no auth failure
 * ever produces -- it was the oracle this comment claims to prevent.
 */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    // Imported inside the handler, matching every other server-side use
    // of this client in the repo: it reads SUPABASE_SERVICE_ROLE_KEY at
    // construction and must never be pulled into a client bundle.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await isAdminUser(supabaseAdmin, context.userId))) {
      throw new Error(UNAUTHORIZED_MESSAGE);
    }
    return next({ context: { ...context, supabaseAdmin } });
  });
