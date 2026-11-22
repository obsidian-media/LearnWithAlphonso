/**
 * Search-engine plumbing: the canonical origin, the per-route canonical and social tags, robots.txt and sitemap.xml.
 *
 * robots.txt and the sitemap are generated from the real route tree (src/routeTree.gen.ts), so a new page cannot
 * rot out of them: a page is listed unless it is named in NOT_INDEXED, and src/lib/seo.test.ts fails when a new
 * page route is in neither list, which forces a decision.
 */

/** The public origin of the web app (the one the legal pages and the share card already name). */
export const SITE_ORIGIN = "https://learnwithalphonso.com";

/** Browser-chrome colours: the Royal light and Royal night page backgrounds (--c-surface). Kept here, outside view code, because a meta tag cannot read a CSS variable. */
export const THEME_COLOR_LIGHT = "#FBF6EC";
export const THEME_COLOR_NIGHT = "#0E1330";

/** The share card every public page uses: public/og-image.png, 1200 x 630. */
export const SHARE_IMAGE = `${SITE_ORIGIN}/og-image.png`;
export const SHARE_IMAGE_ALT = "Alphonso the llama, mascot of Learn With Alphonso";

/** Pages that exist but should not appear in search: flows entered from a link or another page, never a destination. */
export const NOT_INDEXED: readonly string[] = ["/welcome", "/reset-password", "/native-captcha"];

export function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path}`;
}

/** The canonical link for a public page. */
export function canonicalLink(path: string) {
  return { rel: "canonical", href: absoluteUrl(path) };
}

/** og:url, og:site_name and the share card, for a public page's `meta` (spread it next to the page's own tags). */
export function shareMeta(path: string) {
  return [
    { property: "og:url", content: absoluteUrl(path) },
    { property: "og:site_name", content: "Learn With Alphonso" },
    { property: "og:image", content: SHARE_IMAGE },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: SHARE_IMAGE_ALT },
    { name: "twitter:image", content: SHARE_IMAGE },
  ];
}

export type RouteNode = {
  options?: { path?: string; id?: string; component?: unknown; server?: unknown };
  children?: Record<string, RouteNode> | RouteNode[];
};

function childrenOf(node: RouteNode): RouteNode[] {
  const c = node.children;
  if (!c) return [];
  return Array.isArray(c) ? c : Object.values(c);
}

function isPageRoute(node: RouteNode): boolean {
  const path = node.options?.path;
  if (!path || path.includes("$")) return false;
  if (path.startsWith("/api") || path.startsWith("/.well-known")) return false;
  return Boolean(node.options?.component) && !node.options?.server;
}

/** Every page path outside the sign-in layout, whether or not it is indexed. */
export function publicPagePaths(tree: RouteNode): string[] {
  return childrenOf(tree)
    .filter(isPageRoute)
    .map((n) => n.options?.path as string)
    .sort();
}

/** The pages listed in the sitemap: public pages minus NOT_INDEXED. */
export function indexablePaths(tree: RouteNode): string[] {
  return publicPagePaths(tree).filter((p) => !NOT_INDEXED.includes(p));
}

/** First path segment of every sign-in-only route (the pathless layout's children), de-duplicated. */
export function privatePrefixes(tree: RouteNode): string[] {
  const layouts = childrenOf(tree).filter((n) => !n.options?.path && n.options?.id);
  const out = new Set<string>();
  for (const layout of layouts) {
    for (const child of childrenOf(layout)) {
      const first = (child.options?.path ?? "").split("/").filter(Boolean)[0];
      if (first) out.add(`/${first}`);
    }
  }
  return [...out].sort();
}

export function robotsTxt(tree: RouteNode): string {
  const disallow = [
    "/api/",
    ...NOT_INDEXED.filter((p) => p !== "/welcome"),
    ...privatePrefixes(tree),
  ];
  return [
    "User-agent: *",
    "Allow: /",
    ...disallow.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sitemapXml(tree: RouteNode): string {
  const urls = ["/", ...indexablePaths(tree).filter((p) => p !== "/")]
    .map(
      (p) => `  <url><loc>${escapeXml(p === "/" ? `${SITE_ORIGIN}/` : absoluteUrl(p))}</loc></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
