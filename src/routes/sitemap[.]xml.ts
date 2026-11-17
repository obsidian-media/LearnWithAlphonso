import { createFileRoute } from "@tanstack/react-router";
import { sitemapXml } from "@/lib/seo";

/** GET /sitemap.xml: the public, indexable pages on the canonical origin. Built from the route tree (src/lib/seo.ts). */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Imported here, not at the top: the route tree imports this file.
        const { routeTree } = await import("@/routeTree.gen");
        return new Response(sitemapXml(routeTree as never), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
