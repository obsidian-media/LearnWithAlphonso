import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { routeTree } from "./routeTree.gen";
import { readCspNonce } from "./lib/security-policy";

const getRouterNonce = createIsomorphicFn()
  .server(() => {
    try {
      return readCspNonce(getRequest());
    } catch {
      // Router construction in non-request tooling/tests has no SSR context.
      return undefined;
    }
  })
  .client(
    () =>
      document.querySelector('meta[property="csp-nonce"]')?.getAttribute("content") ?? undefined,
  );

export const getRouter = () => {
  const queryClient = new QueryClient();
  const nonce = getRouterNonce();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ssr: { nonce },
  });

  return router;
};
