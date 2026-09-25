// The admin app: same repo, same src/lib, entirely separate routes and
// build output.
//
// Option names verified against the installed @tanstack/start-plugin-core
// schema -- `router.routesDirectory` and `router.generatedRouteTree` are
// both real, typed keys, not a guess.
//
// No `server: { entry: "server" }` here, unlike the learner config: that
// redirects to src/server.ts, which is the learner app's SSR error
// wrapper (it reports to the learner error pipeline). The admin app has
// one user and its errors belong in the platform log, not in that
// pipeline, so it uses the default entry.
import { defineConfig, mergeConfig, type UserConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";

export default defineConfig(async ({ command }) => {
  const isBuild = command === "build";

  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // srcDirectory is the key that actually moves the app, and it is
      // the ONLY one needed. Two things were learned the hard way here:
      //
      // 1. Setting only `router.routesDirectory` leaves srcDirectory at
      //    "src", the route scan finds nothing, and the build dies
      //    inside the manifest plugin with "Cannot convert undefined or
      //    null to object" -- an error naming neither routes nor
      //    directories.
      // 2. `router.routesDirectory` resolves RELATIVE TO srcDirectory.
      //    Passing "admin/routes" alongside srcDirectory "admin" made
      //    the generator create an empty `admin/admin/routes/`.
      //
      // So: set srcDirectory and let routesDirectory and
      // generatedRouteTree default to admin/routes and
      // admin/routeTree.gen.ts.
      srcDirectory: "admin",
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    viteReact(),
  ];

  if (isBuild) {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({}));
  }

  const config: UserConfig = {
    css: { transformer: "lightningcss" },
    resolve: { alias: { "@": `${process.cwd()}/src` } },
    server: { host: "::", port: 8081 },
    build: { outDir: "dist-admin" },
    plugins,
  };

  return mergeConfig(config, {});
});
