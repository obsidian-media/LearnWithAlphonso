import { defineConfig, loadEnv, mergeConfig, type UserConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
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
  ];

  // Sentry release = the deployed commit. Vercel sets VERCEL_GIT_COMMIT_SHA during the build; elsewhere it is "".
  const sentryRelease = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  // Source maps are built (hidden: no sourceMappingURL comment) and uploaded only when all three Sentry settings
  // are present, then deleted before the output is deployed, so no .map file is ever served. Without them (local,
  // CI, a Vercel project without the token) the build is exactly as before: no maps, no upload, no network.
  const sentryUpload = Boolean(
    isBuild &&
    process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT,
  );

  if (isBuild) {
    const { nitro } = await import("nitro/vite");
    const { nitroStaticRoutes, staticHeaderRecord } = await import("./src/lib/static-headers.ts");
    // Static files skip src/server.ts, so their security headers come from here (Nitro writes them into
    // .vercel/output/config.json) and from vercel.json; src/lib/static-headers.ts is the one list.
    const headers = staticHeaderRecord();
    const routeRules = Object.fromEntries(nitroStaticRoutes().map((r) => [r, { headers }]));
    plugins.push(nitro({ routeRules }));
  }

  if (sentryUpload) {
    const { sentryVitePlugin } = await import("@sentry/vite-plugin");
    plugins.push(
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: { name: sentryRelease || undefined },
        sourcemaps: {
          filesToDeleteAfterUpload: [
            "./dist/**/*.map",
            "./.output/**/*.map",
            "./.vercel/output/**/*.map",
          ],
        },
        telemetry: false,
      }),
    );
  }

  const config: UserConfig = {
    build: { sourcemap: sentryUpload ? "hidden" : false },
    define: {
      ...envDefine,
      "import.meta.env.VITE_VERCEL_ENV": JSON.stringify(process.env.VERCEL_ENV ?? ""),
      "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(sentryRelease),
    },
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
