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
