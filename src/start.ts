import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { reportServerError } from "./lib/sentry-server";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { watchAccountSuspended } from "./lib/watch-account-suspended";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    await reportServerError(error, { source: "request_middleware" });
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, watchAccountSuspended],
  requestMiddleware: [errorMiddleware],
}));
