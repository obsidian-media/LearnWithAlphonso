import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminUser } from "./admin-auth";

/**
 * Gate for every admin server function.
 *
 * Chains onto requireSupabaseAuth (which validates the Bearer token and
 * yields userId) and then checks the allowlist with the SERVICE-ROLE
 * client, because admin_users is unreadable with the caller's own token
 * by design.
 *
 * The thrown message is deliberately identical to an ordinary auth
 * failure and names nothing. A distinct "you are not an admin" tells an
 * attacker two things worth having: that the endpoint exists, and that
 * their token was otherwise valid.
 */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    // Imported inside the handler, matching every other server-side use
    // of this client in the repo: it reads SUPABASE_SERVICE_ROLE_KEY at
    // construction and must never be pulled into a client bundle.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await isAdminUser(supabaseAdmin, context.userId))) {
      throw new Error("Unauthorized");
    }
    return next({ context: { ...context, supabaseAdmin } });
  });
