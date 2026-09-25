import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "@/lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

/**
 * The admin app's equivalent of src/start.ts.
 *
 * This file's absence was a complete authentication failure, and a silent
 * one. `vite.admin.config.ts` sets `srcDirectory: "admin"`, so TanStack
 * Start looks for `admin/start.ts` -- not `src/start.ts` -- and with no
 * file there it registered no function middleware at all. Which meant
 * `attachSupabaseAuth` never ran, the browser never attached a bearer
 * token to any serverFn RPC, and `requireSupabaseAuth` rejected every
 * admin call with "No authorization header provided".
 *
 * The symptom was indistinguishable from a rejected login: sign in with
 * Google, land on `/`, have `adminWhoAmI` throw, and get redirected
 * straight back to `/signin`. Nothing in the build, the tests or the
 * types could see it, because the missing piece was a file that was never
 * referenced by name -- and auth-attacher.ts warns about exactly this in
 * its own comment.
 *
 * KEEP IN SYNC with src/start.ts. Anything registered there as a global
 * function middleware has to be registered here too, or it silently does
 * not apply to the admin app.
 */
const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
