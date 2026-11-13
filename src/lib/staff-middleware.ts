import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authorizeStaff } from "./staff-authorize";
import type { Scope } from "./staff-scopes";

/**
 * Gate for every console server function: session, active staff row, second factor, then the named scope.
 * Replaces requireAdmin, which it extends (see authorizeStaff for the order and the error contract).
 *
 * The service-role client is imported inside the handler, as in requireAdmin: it reads SUPABASE_SERVICE_ROLE_KEY at
 * construction and must never reach a client bundle.
 */
export const requireStaff = (scope?: Scope) =>
  createMiddleware({ type: "function" })
    .middleware([requireSupabaseAuth])
    .server(async ({ next, context }) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { staffRole, staffScopes } = await authorizeStaff({
        client: supabaseAdmin,
        userId: context.userId,
        claims: context.claims,
        scope,
        requireAal2: process.env.ADMIN_REQUIRE_AAL2,
      });
      return next({ context: { ...context, supabaseAdmin, staffRole, staffScopes } });
    });
