import { defineConfig, loadEnv, mergeConfig, type UserConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";

// Inlined replacement for @lovable.dev/vite-tanstack-config (removed as part
// of the Lovable decoupling — TASK-078). That wrapper's Lovable-sandbox-only
// behavior (preview asset proxying, HMR gate, dev-server bridge, build/SSR
// error piping to the Lovable editor) is dropped entirely since there is no
// longer a Lovable sandbox to talk to. What's kept below is the actual build
// configuration: TanStack Start + Nitro, Tailwind, path aliases, and VITE_*
// env exposure to the server bundle.
//
// Nitro preset: left unset so Nitro auto-detects the deploy target (Vercel
// sets the env vars Nitro's detection looks for). Force one explicitly with
// `NITRO_PRESET=<preset>` if auto-detection ever picks the wrong target.
export default defineConfig(async ({ command, mode }) => {
  const isBuild = command === "build";

  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadedEnv)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // Redirect TanStack Start's bundled server entry to src/server.ts
      // (our SSR error wrapper). nitro/vite builds from this.
      server: { entry: "server" },
    }),
    viteReact(),
    // NOTE: @lovable.dev/mcp-js's vite plugin has a Windows-only path-
    // separator bug — it mixes Vite's forward-slash `config.root` with
    // `node:path`'s native-separator `resolve()` output, so
    // `assertContains()` fails a build run from a Windows shell (`npm run
    // build` errors with "routesDir ... must resolve under ..., got ...").
    // Pre-existing upstream bug (present before the Lovable decoupling too),
    // not introduced here. Confirmed 2026-09-10: does NOT reproduce on
    // Vercel's Linux build environment — both the pre-merge and post-merge
    // deploys of this branch built successfully there.
    //
    // trustForwardedHost/trustForwardedProto: the plugin defaults both to
    // `true` because Lovable's own proxy authoritatively overwrites those
    // headers before they reach the app, so trusting them there is safe.
    // Vercel does not make that same guarantee for a plain project (no
    // "Verified Proxy" configured) — a client can set its own
    // X-Forwarded-Host/-Proto and Vercel's docs don't promise to strip it.
    // Trusting these by default would let a client spoof the OAuth
    // protected-resource metadata's advertised host/scheme. Disabled here;
    // re-enable only if Vercel's Verified Proxy (or an equivalent
    // authoritatively-overwriting front proxy) is ever put in front of this
    // app. See ledger/tasks/078 (Boardroom repo) for the research trail.
    mcpPlugin({ trustForwardedHost: false, trustForwardedProto: false }),
  ];

  if (isBuild) {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({}));
  }

  const config: UserConfig = {
    define: envDefine,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    server: { host: "::", port: 8080 },
    plugins,
  };

  return mergeConfig(config, {});
});
