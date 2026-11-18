/**
 * Landing bundle guard. Run after `vite build`:
 *
 *   bun run check:bundle
 *
 * Reads TanStack Start's route manifest from the server build (the list of chunks the server modulepreloads for
 * each route) and, for the pages a new visitor lands on, fails when
 *   - the JavaScript they load is over budget (brotli bytes, see LANDING_BUDGET_BROTLI), or
 *   - any of it is course content (the curriculum, lesson banks, vocab images or the `compromise` NLP library),
 *     which belongs to the lesson and learn routes only, or
 *   - a source map is left in the public output (they are uploaded to Sentry and deleted, never served).
 *
 * The 4.8 MB courses chunk that once rode along on / and /auth is what this exists to keep out.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

/** Pages a signed-out visitor opens first. */
export const LANDING_ROUTES = ["/", "/auth"] as const;

/**
 * Brotli bytes of JavaScript per landing route. Set when this guard was added: / measured 1,144.7 KB, of which the
 * courses chunk was 819.7 KB, so ~325 KB without it; this is ~20% above that. Tighten it to 1.2x the measured size
 * once course content is out of the landing set. Raise it on purpose, in review, never to make a red build green.
 */
export const LANDING_BUDGET_BROTLI = 400_000;

/**
 * Strings that only exist in course content, one per module that must stay out of the landing graph: the English
 * lesson bank, the French and Spanish lesson banks (same unit title), the vocab image table and the `compromise`
 * NLP library (its own error message). They survive minification because they are string data.
 */
export const COURSE_MARKERS = [
  "Common clothing vocabulary with colour adjectives.",
  "Greetings & Everyday Phrases",
  "vocab-images/es/abogado.jpg",
  "compromise: Invalid tag",
];

export type RouteManifest = Record<string, { preloads?: string[]; children?: string[] }>;

export type ChunkInfo = {
  file: string;
  raw: number;
  gzip: number;
  brotli: number;
  course: boolean;
};

export type LandingReport = {
  route: string;
  chunks: ChunkInfo[];
  raw: number;
  gzip: number;
  brotli: number;
};

/** The chunk URLs a route preloads: the root's plus its own, deduplicated, in manifest order. */
export function landingChunks(routes: RouteManifest, route: string): string[] {
  const root = routes.__root__?.preloads ?? [];
  const own = routes[route]?.preloads;
  if (!own && route !== "/") throw new Error(`route ${route} is not in the start manifest`);
  return [...new Set([...root, ...(own ?? [])])].filter((f) => f.endsWith(".js"));
}

/** Static imports a chunk makes of sibling chunks (`from"./x.js"`, `import"./x.js"`). */
export function staticImports(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/(?:from|import)\s*["'`]\.\/([\w.$-]+\.js)["'`]/g)) out.add(m[1]);
  return [...out];
}

export function isCourseChunk(file: string, code: string): boolean {
  if (/^courses-[\w-]+\.js$/.test(path.basename(file))) return true;
  return COURSE_MARKERS.some((m) => code.includes(m));
}

export function violations(
  reports: LandingReport[],
  mapFiles: string[],
  budget = LANDING_BUDGET_BROTLI,
) {
  const out: string[] = [];
  for (const r of reports) {
    if (r.brotli > budget) out.push(`${r.route}: ${r.brotli} brotli bytes of JS, budget ${budget}`);
    for (const c of r.chunks.filter((x) => x.course))
      out.push(`${r.route}: course content in the landing graph: ${c.file}`);
  }
  for (const m of mapFiles) out.push(`source map in the public output: ${m}`);
  return out;
}

function walk(dir: string, pred: (f: string) => boolean, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, pred, acc);
    else if (pred(e)) acc.push(p);
  }
  return acc;
}

/** Nitro writes .output locally and .vercel/output on Vercel. */
export function findBuild(root: string): { manifest: string; publicDir: string } {
  const layouts = [
    { server: ".vercel/output/functions", publicDir: ".vercel/output/static" },
    { server: ".output/server", publicDir: ".output/public" },
  ];
  for (const l of layouts) {
    const manifests = walk(path.join(root, l.server), (f) =>
      /^_tanstack-start-manifest.*\.m?js$/.test(f),
    );
    if (manifests.length > 0)
      return { manifest: manifests[0], publicDir: path.join(root, l.publicDir) };
  }
  throw new Error("no build found: run `bunx vite build` first");
}

function measure(publicDir: string, url: string): { code: string; info: ChunkInfo } {
  const file = path.join(publicDir, url.replace(/^\//, ""));
  const buf = readFileSync(file);
  const code = buf.toString("utf8");
  return {
    code,
    info: {
      file: url,
      raw: buf.length,
      gzip: gzipSync(buf, { level: 9 }).length,
      brotli: brotliCompressSync(buf, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
          [constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
        },
      }).length,
      course: false,
    },
  };
}

export async function run(
  root = process.cwd(),
): Promise<{ reports: LandingReport[]; problems: string[] }> {
  const { manifest, publicDir } = findBuild(root);
  const mod = (await import(pathToFileURL(manifest).href)) as {
    tsrStartManifest: () => { routes: RouteManifest };
  };
  const routes = mod.tsrStartManifest().routes;
  const cache = new Map<string, { code: string; info: ChunkInfo }>();
  const load = (url: string) => {
    let hit = cache.get(url);
    if (!hit) {
      hit = measure(publicDir, url);
      hit.info.course = isCourseChunk(url, hit.code);
      cache.set(url, hit);
    }
    return hit;
  };

  const reports: LandingReport[] = [];
  for (const route of LANDING_ROUTES) {
    const seen = new Set<string>();
    const queue = landingChunks(routes, route);
    while (queue.length > 0) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      const dir = path.posix.dirname(url);
      for (const dep of staticImports(load(url).code)) queue.push(`${dir}/${dep}`);
    }
    const chunks = [...seen].map((u) => load(u).info);
    reports.push({
      route,
      chunks,
      raw: chunks.reduce((s, c) => s + c.raw, 0),
      gzip: chunks.reduce((s, c) => s + c.gzip, 0),
      brotli: chunks.reduce((s, c) => s + c.brotli, 0),
    });
  }
  const mapFiles = walk(publicDir, (f) => f.endsWith(".map")).map((f) => path.relative(root, f));
  return { reports, problems: violations(reports, mapFiles) };
}

if (import.meta.main) {
  const { reports, problems } = await run();
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  for (const r of reports) {
    console.log(
      `${r.route}: ${r.chunks.length} JS chunks, raw ${kb(r.raw)}, gzip ${kb(r.gzip)}, brotli ${kb(r.brotli)} (budget ${kb(LANDING_BUDGET_BROTLI)})`,
    );
    for (const c of [...r.chunks].sort((a, b) => b.raw - a.raw).slice(0, 8))
      console.log(
        `  ${c.file}  raw ${kb(c.raw)}  br ${kb(c.brotli)}${c.course ? "  COURSE CONTENT" : ""}`,
      );
  }
  if (problems.length > 0) {
    console.error(`\ncheck:bundle failed:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\ncheck:bundle ok");
}
