import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// vitest.config.ts doesn't enable `globals`, so @testing-library/react's
// automatic afterEach-based cleanup never registers -- without this, DOM
// from one test in a file bleeds into the next.
afterEach(() => {
  cleanup();
});
