import { createFileRoute } from "@tanstack/react-router";
import { appleAppSiteAssociation } from "@/lib/apple-app-site-association";

/**
 * GET /.well-known/apple-app-site-association: tells iOS that friend invite links (`/invite/<code>`) open in the app
 * instead of Safari (Universal Links). Served by a route, not a static file, so the content type is application/json
 * (a file with no extension is not guaranteed that type). Public and holds nothing private.
 */
export const Route = createFileRoute("/.well-known/apple-app-site-association")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(appleAppSiteAssociation()), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
