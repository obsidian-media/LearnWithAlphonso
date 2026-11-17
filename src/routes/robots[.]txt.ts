import { createFileRoute } from "@tanstack/react-router";
import { robotsTxt } from "@/lib/seo";

/** GET /robots.txt: public pages open to crawlers, the sign-in-only routes and the API closed. Built from the route tree (src/lib/seo.ts). */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        // Imported here, not at the top: the route tree imports this file.
        const { routeTree } = await import("@/routeTree.gen");
        return new Response(robotsTxt(routeTree as never), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
