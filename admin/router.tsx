import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { routeTree } from "./routeTree.gen";
import { readCspNonce } from "../src/lib/security-policy";

const getRouterNonce = createIsomorphicFn()
  .server(() => {
    try {
      return readCspNonce(getRequest());
    } catch {
      return undefined;
    }
  })
  .client(
    () =>
      document.querySelector('meta[property="csp-nonce"]')?.getAttribute("content") ?? undefined,
  );

// The admin equivalent of src/router.tsx. No QueryClient context: the
// learner app threads one through for its caching layer, and the admin
// screens load through route loaders and invalidate on write, which is
// the whole caching story a single-operator tool needs.
export const getRouter = () => {
  const nonce = getRouterNonce();
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ssr: { nonce },
  });
};
