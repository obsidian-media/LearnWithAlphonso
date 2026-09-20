import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getRouter } from "./router";

describe("getRouter", () => {
  it("builds a router with a fresh QueryClient in context", () => {
    const router = getRouter();
    expect(router.options.context?.queryClient).toBeInstanceOf(QueryClient);
  });

  it("enables scroll restoration and disables preload staleness", () => {
    const router = getRouter();
    expect(router.options.scrollRestoration).toBe(true);
    expect(router.options.defaultPreloadStaleTime).toBe(0);
  });

  it("returns an independent router (and QueryClient) on each call", () => {
    const a = getRouter();
    const b = getRouter();
    expect(a).not.toBe(b);
    expect(a.options.context?.queryClient).not.toBe(b.options.context?.queryClient);
  });
});
