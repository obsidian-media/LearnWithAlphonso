import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    // Capped deliberately. Unpinned, vitest spawns a worker per core, and on
    // a loaded machine those workers start timing out -- which does NOT
    // present as a failure. A real run on 2026-09-25 printed:
    //
    //     Test Files  124 passed (124)
    //     Errors      6 errors        <- "Timeout waiting for worker to respond"
    //
    // Six of the 130 files never executed, next to a line that reads as a
    // green suite. Two other sessions hit the same thing the same day
    // ("2 failed" once, "82 of 129 files" another), both spurious, with tens
    // of stray node/bun processes on the box.
    //
    // A suite whose green depends on machine load is the "test that cannot
    // fail" problem in a different hat: the signal is there, but it is in a
    // line nobody reads. Four workers is no real cost in CI either, where
    // GitHub runners have 2-4 cores anyway.
    //
    // If a run ever prints an `Errors N errors` line, treat it as a failed
    // run regardless of what the "Test Files" line says.
    maxWorkers: 4,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/routeTree.gen.ts"],
    },
  },
});
