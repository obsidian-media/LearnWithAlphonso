import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";
import {
  NOT_INDEXED,
  SITE_ORIGIN,
  indexablePaths,
  privatePrefixes,
  publicPagePaths,
  robotsTxt,
  sitemapXml,
  type RouteNode,
} from "./seo";
import { Route as RobotsRoute } from "@/routes/robots[.]txt";
import { Route as SitemapRoute } from "@/routes/sitemap[.]xml";
import { Route as RootRoute } from "@/routes/__root";

const tree = routeTree as unknown as RouteNode;

// When a page is added this list fails: decide whether it belongs in search (add it here) or in NOT_INDEXED.
const EXPECTED_INDEXED = [
  "/",
  "/accessibility",
  "/auth",
  "/cookies",
  "/privacy",
  "/support",
  "/terms",
];

describe("sitemap and robots come from the route tree", () => {
  it("lists exactly the public indexable pages, on the canonical origin", () => {
    expect(indexablePaths(tree)).toEqual(EXPECTED_INDEXED);
    const xml = sitemapXml(tree);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      `${SITE_ORIGIN}/`,
      ...EXPECTED_INDEXED.filter((p) => p !== "/").map((p) => `${SITE_ORIGIN}${p}`),
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("every public page is either indexed or deliberately not", () => {
    const all = publicPagePaths(tree);
    expect([...all].sort()).toEqual([...EXPECTED_INDEXED, ...NOT_INDEXED].sort());
    for (const p of NOT_INDEXED) expect(indexablePaths(tree)).not.toContain(p);
  });

  it("never lists a sign-in-only, API or dynamic route", () => {
    const xml = sitemapXml(tree);
    for (const bad of [
      "/learn",
      "/lesson",
      "/profile",
      "/api",
      "$",
      "/.well-known",
      "/reset-password",
    ]) {
      expect(xml).not.toContain(`${SITE_ORIGIN}${bad}`);
    }
    expect(xml.replace(SITE_ORIGIN, "")).not.toContain("$");
  });

  it("robots.txt opens the site, closes the API and every sign-in-only route, and names the sitemap", () => {
    const txt = robotsTxt(tree);
    expect(txt).toContain("User-agent: *\nAllow: /\n");
    expect(txt).toContain("Disallow: /api/");
    const prefixes = privatePrefixes(tree);
    for (const p of ["/learn", "/lesson", "/profile", "/path", "/hector", "/listen", "/teams"]) {
      expect(prefixes).toContain(p);
      expect(txt).toContain(`Disallow: ${p}\n`);
    }
    for (const p of EXPECTED_INDEXED.filter((x) => x !== "/")) {
      expect(txt).not.toContain(`Disallow: ${p}\n`);
    }
    expect(txt).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    // Only robots.txt directives: no stray lines.
    for (const line of txt.split("\n").filter(Boolean)) {
      expect(line).toMatch(/^(User-agent|Allow|Disallow|Sitemap): \S+$/);
    }
  });

  it("serves both files with the right content type", async () => {
    const robots = await (
      RobotsRoute.options as unknown as { server: { handlers: { GET: () => Promise<Response> } } }
    ).server.handlers.GET();
    expect(robots.headers.get("content-type")).toContain("text/plain");
    expect(await robots.text()).toContain("Sitemap:");
    const sitemap = await (
      SitemapRoute.options as unknown as { server: { handlers: { GET: () => Promise<Response> } } }
    ).server.handlers.GET();
    expect(sitemap.headers.get("content-type")).toContain("application/xml");
    expect(await sitemap.text()).toContain("<urlset");
  });
});

describe("per-page head tags", () => {
  it("every indexed page carries a canonical link and og:url on its own path", async () => {
    const { routeTree: rt } = await import("@/routeTree.gen");
    const children = Object.values(
      (rt as unknown as { children: Record<string, RouteNode> }).children,
    );
    for (const path of EXPECTED_INDEXED) {
      const node = children.find((c) => c.options?.path === path) as unknown as {
        options: {
          head: () => { links?: { rel: string; href: string }[]; meta: Record<string, string>[] };
        };
      };
      const head = node.options.head();
      const url = path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
      expect(head.links).toContainEqual({ rel: "canonical", href: url });
      expect(head.meta).toContainEqual({ property: "og:url", content: url });
      expect(head.meta.some((m) => m.property === "og:title")).toBe(true);
      expect(head.meta.some((m) => m.name === "description")).toBe(true);
    }
  });

  it("the root head has a share image and a twitter card", () => {
    const head = (
      RootRoute.options as unknown as { head: () => { meta: Record<string, string>[] } }
    ).head();
    const find = (k: string, v: string) => head.meta.filter((m) => m[k] === v);
    expect(find("property", "og:image")[0]?.content).toBe(`${SITE_ORIGIN}/og-image.png`);
    expect(find("name", "twitter:card")[0]?.content).toBe("summary_large_image");
  });
});
